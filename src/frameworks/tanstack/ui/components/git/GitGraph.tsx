/* biome-ignore-all lint/a11y/useSemanticElements: 行ごとの grid で列を揃えるので table の要素を置けない */
/* biome-ignore-all lint/a11y/useFocusableInteractive: セルは行ごと辿る。1 つずつのタブ順は作らない */

import { mdiAlertOutline, mdiHomeOutline, mdiRhombus } from '@mdi/js';
import { useMemo } from 'react';
import type { GitOverviewJson } from '~/interface/presenters/git/git.presenter.ts';
import type {
  GithubActorJson,
  IssueSummaryJson,
} from '~/interface/presenters/issues/issues.presenter.ts';
import type { ProjectJson } from '~/interface/presenters/sessions/tree.presenter.ts';
import type { GraphRow, TipSortKey } from '../../derive/gitGraph.ts';
import { layoutOf, sortTips } from '../../derive/gitGraph.ts';
import { pullStateLabel, reviewLabel } from '../../derive/labels.ts';
import { milestonesOnBranch } from '../../derive/milestones.ts';
import {
  type Occupant,
  occupantIndex,
  occupantsOf,
  occupantsOnBranch,
} from '../../derive/occupants.ts';
import { workerIndex, workersOn } from '../../derive/workers.ts';
import type { WorkJoin } from '../../derive/workJoin.ts';
import { cut, formatSinceIso } from '../../format.ts';
import { useT } from '../../i18n/useT.ts';
import { useNav } from '../../nav/NavContext.tsx';
import { laneColor } from '../../palette.ts';
import { pulseDelay } from '../../phase.ts';
import { pressable } from '../../pressable.ts';
import { AgentChip } from '../chips/Chips.tsx';
import { AvatarStack } from '../primitives/Avatar.tsx';
import { Icon } from '../primitives/Icon.tsx';
import { SubjectText } from '../text/SubjectText.tsx';
import { GitGutter } from './GitGutter.tsx';
import { GitToolbar } from './GitToolbar.tsx';

/* 生きているブランチの線を、本流の上に重ねて描く。

   1 行が 1 つの `ref` かコミットで、左の余白がその行を通る線を描く。行を包む要素を
   増やさない — 線は行の高さを前提に座標を決めているので、間に何か挟むと線が行からずれる。

   コンフリクトの見込みは表の上に出す。同じファイルを 2 本の線が触っているという事実は、
   どちらの行にも属さない。`#git-rows` は `role="grid"` なので、列を持たないもの —
   コンフリクトの見込みと、行を開く操作の説明 — はその外へ置く。

   ツールバーもここが出す。**一致件数の数え方をツールバーと表で分けない** — 分けると、
   沈んだ行の数とツールバーに出た数が食い違い、どちらが本当か分からなくなる。 */

/** 並べるエージェントのチップの数 */
const MAX_LISTED_OCCUPANTS = 4;

/** これだけ遅れていたら、目を引く色にする */
const BEHIND_WARN = 50;

/** 表の上に出すコンフリクトの数 */
const MAX_LISTED_CONFLICTS = 4;

/** 1 行に並べる課題の数。ブランチ 1 本が何十件も閉じることは無いので、これで足りる */
const MAX_LISTED_ISSUES = 3;

/** 1 行に並べる顔の数 */
const MAX_LISTED_FACES = 3;

/** 行を開く操作の説明を指す id。全部の行が同じ 1 つを指す */
const OPEN_HINT_ID = 'git-open-hint';

export interface GitOrder {
  readonly key: TipSortKey;
  readonly direction: 'asc' | 'desc';
}

export interface GitGraphProps {
  readonly overview: GitOverviewJson;
  readonly project: ProjectJson | undefined;
  readonly query: string;
  readonly onQuery: (query: string) => void;
  readonly order: GitOrder;
  readonly onSort: (key: TipSortKey) => void;
  readonly nowMs: number;
  /** ツールバーの先頭に置くもの。行の単位を選ぶ切り替えがここへ入る */
  readonly lead?: React.ReactNode | undefined;
  /** 課題とブランチの突き合わせ。無ければブランチの行に課題が出ないだけ */
  readonly join?: WorkJoin | undefined;
}

export function GitGraph({
  overview,
  project,
  query,
  onQuery,
  order,
  onSort,
  nowMs,
  lead,
  join,
}: GitGraphProps) {
  const t = useT();
  const nav = useNav();
  const occupants = useMemo(() => occupantIndex(project), [project]);
  /* 課題の id で結んだエージェント。**cwd とブランチだけでは足りない** —— 会話の中で
     この課題を名指しているのに、別の場所で動いているエージェントが居る */
  const workers = useMemo(() => workerIndex(project), [project]);
  const layout = useMemo(
    () => layoutOf(overview.mainline, sortTips(overview.tips, order.key, order.direction)),
    [overview.mainline, overview.tips, order.key, order.direction],
  );
  const delay = useMemo(() => pulseDelay(nowMs), [nowMs]);

  const { rows, firstMain, unseenBase, width } = layout;
  const tipStates = new Map<number, string>();
  rows.forEach((row, index) => {
    if (row.type !== 'tip') return;
    tipStates.set(index, occupantsOf(occupants, row.tip.worktree)[0]?.state ?? '');
  });

  /* プロジェクトの直下に居るエージェント。配下の作業ディレクトリに居るぶんまで拾うと、
     本流の行に全員が並ぶ。 */
  const root = project?.path ?? null;
  const rootOccupants = occupantsOf(occupants, root).filter((occupant) =>
    (project?.sessions ?? []).some(
      (session) =>
        (session.file === occupant.file && session.cwd === root) ||
        session.subagents.some((child) => child.file === occupant.file && child.cwd === root),
    ),
  );

  const needle = query.trim().toLowerCase();
  const matched = (row: GraphRow): boolean => {
    if (needle === '') return true;
    const fields =
      row.type === 'tip'
        ? [
            row.tip.name,
            row.tip.worktree,
            row.tip.subject,
            row.tip.sha,
            ...occupantsOf(occupants, row.tip.worktree).map((occupant) => occupant.label),
          ]
        : row.type === 'node'
          ? [row.node.subject, row.node.sha]
          : [];
    return fields.some((field) => field?.toLowerCase().includes(needle) === true);
  };

  const matches = needle === '' ? null : rows.filter(matched).length;

  return (
    <>
      <GitToolbar
        query={query}
        onQuery={onQuery}
        base={overview.base}
        matches={matches}
        tips={overview.tips.length}
        worktrees={overview.worktrees.length}
        branches={overview.branches.length}
        lead={lead}
      />
      {overview.conflicts.length > 0 && (
        <div className="git-conflicts">
          {overview.conflicts.slice(0, MAX_LISTED_CONFLICTS).map((conflict) => (
            <div
              key={`${conflict.a}~${conflict.b}`}
              className="gc-row"
              title={conflict.files.join('\n')}
            >
              ⚠{' '}
              <button
                type="button"
                className="gc-name"
                onClick={() => nav.openRef(conflict.a, conflict.a)}
              >
                {conflict.a}
              </button>
              {' ⇄ '}
              <button
                type="button"
                className="gc-name"
                onClick={() => nav.openRef(conflict.b, conflict.b)}
              >
                {conflict.b}
              </button>
              <span className="dimtxt">
                {' '}
                {t(
                  '— {n, plural, one {# shared file} other {# shared files}} (merge conflict likely)',
                  { n: conflict.n },
                )}
              </span>
            </div>
          ))}
        </div>
      )}
      {/* 行を開く操作の説明。全部の行が指す 1 つで足りるので、行の中には置かない —
          置くと 6 列の行に 7 個目のセルが増える */}
      <span id={OPEN_HINT_ID} className="vhidden">
        {t('Press Enter to open the ref or commit')}
      </span>
      {/* 表そのものが `grid` である。**行を `button` にすると中身が消える。** `button` は
          中の要素を読み上げから外す役なので、ahead も behind も sha も更新の時刻も、
          行の名前 1 つに置き換わってしまう。 */}
      <div id="git-rows" role="grid" aria-label={t('Refs and commits')}>
        <div className="git-row head" role="row">
          {/* 線を描く余白の列。行の側でも `aria-hidden` の svg が占める */}
          <span aria-hidden="true" style={{ width }} />
          <SortHead label={t('Ref / Commit')} sortKey="name" order={order} onSort={onSort} />
          <span role="columnheader">{t('Assignee / Agents')}</span>
          <SortHead label={t('Ahead')} sortKey="ahead" order={order} onSort={onSort} right />
          <SortHead label={t('Updated')} sortKey="date" order={order} onSort={onSort} right />
          <span role="columnheader">{t('SHA')}</span>
        </div>
        {rows.map((row, index) => {
          const gutter = (
            <GitGutter row={index} layout={layout} tipStates={tipStates} delay={delay} />
          );
          const dim = matched(row) ? '' : ' dim';

          if (row.type === 'tip') {
            const tip = row.tip;
            /* worktree に居る者と、そのブランチに居る者。**両方を見る** —— worktree を
               切らない使い方では cwd が全員同じになり、誰がどのブランチに居るかが消える */
            const here: Present[] = [...occupantsOf(occupants, tip.worktree)];
            for (const found of occupantsOnBranch(project, tip.name)) {
              if (!here.some((other) => other.file === found.file)) here.push(found);
            }

            /* このブランチの PR が閉じる課題と、その PR と、その担当。**推測ではなく PR が
               言っている** —— 名前の似ているところから探しに行くと、別の課題を結ぶ。 */
            const closes = join?.byBranch.get(tip.name) ?? [];
            const pull = join?.pullByBranch.get(tip.name) ?? null;
            const assignees = actorsOf(closes);

            /* 課題の側から辿れるエージェントも並べる。ここに居るのとは繋がり方が違うので、
               どの課題で結んだのかを添える。 */
            for (const issue of closes) {
              for (const worker of workersOn(workers, issue)) {
                if (worker.state === 'ended') continue;
                if (here.some((other) => other.file === worker.file)) continue;
                here.push({
                  file: worker.file,
                  state: worker.state,
                  label: worker.label,
                  via: t('named {id} in its conversation', { id: issue.id ?? '' }),
                });
              }
            }

            const rev = tip.kind === 'branch' ? tip.name : tip.sha;
            const worktreeLeaf = tip.worktree?.split('/').pop() ?? '';
            return (
              /* 行は `row` である。**`button` にすると中身が全部消える。** 名前は行が名乗る
                 のではなく、5 つのセルが自分で言う。開く操作は `aria-describedby` の指す
                 説明で言う — 名前にすると、中のチップも押しどころとして不正になる。 */
              <div
                key={`t:${tip.name}:${tip.sha}`}
                className={`git-row${dim}`}
                title={tip.worktree ?? tip.name}
                data-name={`${tip.name} ${worktreeLeaf} ${tip.sha}`}
                role="row"
                tabIndex={0}
                aria-describedby={OPEN_HINT_ID}
                {...pressable(() => nav.openRef(rev, tip.name))}
              >
                {gutter}
                <span className="g-title" role="gridcell">
                  <span
                    className={tip.kind === 'branch' ? 'g-branch-name' : 'g-wt-name'}
                    style={{ color: laneColor(row.lane - 1) }}
                  >
                    {tip.kind === 'worktree' && <Icon path={mdiHomeOutline} size={11} />} {tip.name}
                  </span>
                  {tip.kind === 'branch' && tip.worktree !== null && (
                    <span className="g-wtmark" title={tip.worktree}>
                      {' '}
                      <Icon path={mdiHomeOutline} size={10} /> {worktreeLeaf}
                    </span>
                  )}
                  {pull !== null && (
                    <span
                      className={`prchip ${pull.is_draft ? 'draft' : pull.state.toLowerCase()}`}
                      title={t('Pull request #{number} — {state}{review}', {
                        number: pull.number,
                        state: pull.is_draft ? t('draft') : pullStateLabel(t, pull.state),
                        review:
                          pull.review_decision === null
                            ? ''
                            : `, ${reviewLabel(t, pull.review_decision)}`,
                      })}
                    >
                      #{pull.number}
                      {pull.is_draft && ` ${t('draft')}`}
                    </span>
                  )}
                  {closes.slice(0, MAX_LISTED_ISSUES).map((issue) => (
                    <ClosesChip key={issue.id} issue={issue} />
                  ))}
                  {closes.length > MAX_LISTED_ISSUES && (
                    <span
                      className="g-more"
                      title={closes
                        .slice(MAX_LISTED_ISSUES)
                        .map((issue) => `${issue.id ?? ''} ${issue.title ?? ''}`)
                        .join('\n')}
                    >
                      +{closes.length - MAX_LISTED_ISSUES}
                    </span>
                  )}
                  {/* このブランチが関わっている区切り。**ブランチ自身は持っていない** —
                      持っているのは、その PR が閉じる課題のほうである。 */}
                  {milestonesOnBranch(tip.name, closes).map((title) => (
                    <button
                      key={title}
                      type="button"
                      className="mschip"
                      title={t('Milestone: {title} — show just this milestone', { title })}
                      {...pressable(() => nav.gotoMilestone(title), { stopPropagation: true })}
                    >
                      {cut(title, 18)}
                    </button>
                  ))}
                  {/* 分かれ目が見えていない。**黙ると、線の引き先が分かれ目として読まれる** */}
                  {unseenBase.has(index) && (
                    <span
                      className="g-cut"
                      title={t(
                        'The branch point is not among the commits shown, so this line runs to the bottom of the graph — it did not fork there',
                      )}
                    >
                      <Icon path={mdiAlertOutline} size={10} /> {t('fork not shown')}
                    </span>
                  )}
                </span>
                <span className="g-who" role="gridcell">
                  {/* GitHub の担当と、いま動いているエージェント。課題の一覧と同じ並べ方にする —
                      同じ 2 つを見ているので、単位が違っても読み方は変えない */}
                  {assignees.length > 0 && (
                    <AvatarStack actors={assignees} max={MAX_LISTED_FACES} />
                  )}
                  <Occupants here={here} />
                </span>
                <span className="g-ahead right" role="gridcell">
                  {tip.ahead > 0 ? `+${tip.ahead}` : ''}
                  {tip.behind > 0 && (
                    <span
                      className={`g-behind${tip.behind >= BEHIND_WARN ? ' warn' : ''}`}
                      title={t(
                        '{n, plural, one {# commit behind {base}} other {# commits behind {base}}}',
                        { n: tip.behind, base: overview.base },
                      )}
                    >
                      {' '}
                      −{tip.behind}
                    </span>
                  )}
                </span>
                <span className="g-date" role="gridcell">
                  {formatSinceIso(t, tip.date, nowMs)}
                </span>
                <span className="g-sha" role="gridcell">
                  {tip.sha.slice(0, 9)}
                </span>
              </div>
            );
          }

          if (row.type === 'fold') {
            return (
              <div
                key={`f:${row.from}`}
                className={`git-row fold${needle === '' ? '' : ' dim'}`}
                role="row"
              >
                {gutter}
                <span className="g-title g-fold" role="gridcell">
                  ··· {t('{n} commits', { n: row.count })}
                </span>
                <span role="gridcell" />
                <span role="gridcell" />
                <span role="gridcell" />
                <span role="gridcell" />
              </div>
            );
          }

          const node = row.node;
          const isHead = index === firstMain;
          return (
            /* コミットの行も `row` である。題名・居る者・時刻・sha は、行の名前ではなく
               セルとして渡す */
            <div
              key={`n:${node.sha}`}
              className={`git-row${node.merge ? ' merge' : ''}${dim}`}
              /* 本文中の sha にホバーしたら、この行がハイライトされる。**完全な sha を
                 持たせる** — 突き合わせは部分一致なので、本文の桁数が短くても当たる。 */
              data-name={node.sha}
              role="row"
              tabIndex={0}
              aria-describedby={OPEN_HINT_ID}
              {...pressable(() => nav.openRef(node.sha, node.sha.slice(0, 9)))}
            >
              {gutter}
              <span className="g-title" role="gridcell">
                {isHead && <span className="g-base-name">{overview.base} </span>}
                <span className="g-subject" title={node.subject}>
                  <SubjectText text={node.subject} project={project} />
                </span>
              </span>
              <span className="g-who" role="gridcell">
                {isHead ? <Occupants here={rootOccupants} /> : null}
              </span>
              <span role="gridcell" />
              <span className="g-date" role="gridcell">
                {formatSinceIso(t, node.date, nowMs)}
              </span>
              <span className="g-sha" role="gridcell">
                {node.sha.slice(0, 9)}
              </span>
            </div>
          );
        })}
        {/* 遡る数の上限で本流が切れている。**黙ると、これで全部の履歴として読まれる** */}
        {overview.mainline_truncated && (
          <div className="git-row cut" role="row">
            <span aria-hidden="true" style={{ width }} />
            <span
              className="g-title g-cut"
              role="gridcell"
              title={t(
                'glasshive reads only the most recent stretch of {base} — commits older than these are not read, and a branch that left earlier has no branch point to draw',
                { base: overview.base },
              )}
            >
              ··· {t('older commits are not read')}
            </span>
            <span role="gridcell" />
            <span role="gridcell" />
            <span role="gridcell" />
            <span role="gridcell" />
          </div>
        )}
      </div>
    </>
  );
}

/* 行に出すエージェント。**なぜここに出したかを持たせる** —— worktree に居るのと、
   その課題を会話で名指しているのとは、同じ「関わっている」でも強さが違う。 */
type Present = Occupant & { readonly via?: string | null };

/** 閉じる課題たちの担当を、重複なく 1 列に */
function actorsOf(issues: readonly IssueSummaryJson[]): readonly GithubActorJson[] {
  const found = new Map<string, GithubActorJson>();
  for (const issue of issues) {
    for (const actor of issue.github?.assignees ?? []) {
      if (!found.has(actor.login)) found.set(actor.login, actor);
    }
  }
  return [...found.values()];
}

function Occupants({ here }: { here: readonly Present[] }) {
  return (
    <>
      {here.slice(0, MAX_LISTED_OCCUPANTS).map((occupant) => (
        <AgentChip
          key={occupant.file}
          file={occupant.file}
          state={occupant.state}
          label={occupant.label}
          via={occupant.via}
        />
      ))}
      {here.length > MAX_LISTED_OCCUPANTS && (
        <span className="g-more">+{here.length - MAX_LISTED_OCCUPANTS}</span>
      )}
    </>
  );
}

interface HeadProps {
  readonly label: string;
  readonly sortKey: TipSortKey;
  readonly order: GitOrder;
  readonly onSort: (key: TipSortKey) => void;
  readonly right?: boolean;
}

/* 並べ替えられる列の見出し。**セルと押しどころを入れ子にする。** この列がいまどう
   並んでいるかを言う `aria-sort` は `columnheader` にしか置けず、その `columnheader` 自身を
   押しどころにすると、今度は「押せる」ことが読み上げから消える。中の `button` が押しどころを
   持てば、どちらも失わない。 */
function SortHead({ label, sortKey, order, onSort, right }: HeadProps) {
  const on = order.key === sortKey;
  const className = [
    'sortable',
    right === true ? 'right' : '',
    on ? 'sorted' : '',
    on && order.direction === 'desc' ? 'desc' : '',
  ]
    .filter(Boolean)
    .join(' ');
  return (
    <div
      role="columnheader"
      aria-sort={on ? (order.direction === 'desc' ? 'descending' : 'ascending') : 'none'}
    >
      <button type="button" className={className} onClick={() => onSort(sortKey)}>
        {label}
      </button>
    </div>
  );
}

/* このブランチの PR が閉じる課題。押すと課題のパネルが開く。

   **状態を出す。** 閉じた課題を閉じるためのブランチが残っているのは、片付け忘れという
   読める事実で、開いた課題と同じ顔で並べるとそれが消える。 */
function ClosesChip({ issue }: { readonly issue: IssueSummaryJson }) {
  const t = useT();
  const nav = useNav();
  const id = issue.id ?? '';
  const closed = issue.status === 'closed';
  return (
    <button
      type="button"
      className={`ichip closes${closed ? ' closed' : ''}`}
      title={t('{id} {title} — closed by the pull request on this branch', {
        id,
        title: issue.title ?? '',
      })}
      aria-label={t('Open issue {id}', { id })}
      {...pressable(() => nav.openIssue(id), { stopPropagation: true })}
    >
      <Icon path={mdiRhombus} size={9} className="ichip-i" />
      {id}
    </button>
  );
}
