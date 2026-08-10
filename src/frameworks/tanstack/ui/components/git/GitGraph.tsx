import { mdiHomeOutline } from '@mdi/js';
import { useMemo } from 'react';
import type { GitOverviewJson } from '~/interface/presenters/git/git.presenter.ts';
import type { ProjectJson } from '~/interface/presenters/sessions/tree.presenter.ts';
import type { GraphRow, TipSortKey } from '../../derive/gitGraph.ts';
import { layoutOf, sortTips } from '../../derive/gitGraph.ts';
import { type Occupant, occupantIndex, occupantsOf } from '../../derive/occupants.ts';
import { formatSinceIso } from '../../format.ts';
import { useNav } from '../../nav/NavContext.tsx';
import { laneColor } from '../../palette.ts';
import { pulseDelay } from '../../phase.ts';
import { pressable } from '../../pressable.ts';
import { AgentChip } from '../chips/Chips.tsx';
import { Icon } from '../primitives/Icon.tsx';
import { SubjectText } from '../text/SubjectText.tsx';
import { GitGutter } from './GitGutter.tsx';
import { GitToolbar } from './GitToolbar.tsx';

/* 生きているブランチの線を、本流の上に重ねて描く。

   1 行が 1 つの `ref` かコミットで、左の余白がその行を通る線を描く。行を包む要素を
   増やさない — 線は行の高さを前提に座標を決めているので、間に何か挟むと線が行からずれる。

   コンフリクトの見込みは表の上に出す。同じファイルを 2 本の線が触っているという事実は、
   どちらの行にも属さない。

   ツールバーもここが出す。**一致件数の数え方をツールバーと表で分けない** — 分けると、
   沈んだ行の数とツールバーに出た数が食い違い、どちらが本当か分からなくなる。 */

/** 並べるエージェントのチップの数 */
const MAX_LISTED_OCCUPANTS = 4;

/** これだけ遅れていたら、目を引く色にする */
const BEHIND_WARN = 50;

/** 表の上に出すコンフリクトの数 */
const MAX_LISTED_CONFLICTS = 4;

export interface GitOrder {
  readonly key: TipSortKey;
  readonly direction: 'asc' | 'desc';
}

export interface GitGraphProps {
  readonly overview: GitOverviewJson;
  readonly project: ProjectJson | undefined;
  /** 台帳の上で統合待ちになっている課題の id */
  readonly mergeReady: readonly string[];
  readonly query: string;
  readonly onQuery: (query: string) => void;
  readonly order: GitOrder;
  readonly onSort: (key: TipSortKey) => void;
  readonly nowMs: number;
}

export function GitGraph({
  overview,
  project,
  mergeReady,
  query,
  onQuery,
  order,
  onSort,
  nowMs,
}: GitGraphProps) {
  const nav = useNav();
  const occupants = useMemo(() => occupantIndex(project), [project]);
  const layout = useMemo(
    () => layoutOf(overview.mainline, sortTips(overview.tips, order.key, order.direction)),
    [overview.mainline, overview.tips, order.key, order.direction],
  );
  const delay = useMemo(() => pulseDelay(nowMs), [nowMs]);

  const { rows, firstMain, width } = layout;
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
      />
      <div id="git-rows">
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
                  — {conflict.n} shared file{conflict.n > 1 ? 's' : ''} (merge conflict likely)
                </span>
              </div>
            ))}
          </div>
        )}
        <div className="git-row head">
          <span style={{ width }} />
          <SortHead label="Ref / Commit" sortKey="name" order={order} onSort={onSort} />
          <span>Agents</span>
          <SortHead label="Ahead" sortKey="ahead" order={order} onSort={onSort} right />
          <SortHead label="Updated" sortKey="date" order={order} onSort={onSort} right />
          <span>SHA</span>
        </div>
        {rows.map((row, index) => {
          const gutter = (
            <GitGutter row={index} layout={layout} tipStates={tipStates} delay={delay} />
          );
          const dim = matched(row) ? '' : ' dim';

          if (row.type === 'tip') {
            const tip = row.tip;
            const here = occupantsOf(occupants, tip.worktree);
            const rev = tip.kind === 'branch' ? tip.name : tip.sha;
            const worktreeLeaf = tip.worktree?.split('/').pop() ?? '';
            return (
              // biome-ignore lint/a11y/useSemanticElements: 中にチップを持つ行は button にできない
              <div
                key={`t:${tip.name}:${tip.sha}`}
                className={`git-row${dim}`}
                title={tip.worktree ?? tip.name}
                data-name={`${tip.name} ${worktreeLeaf} ${tip.sha}`}
                role="button"
                tabIndex={0}
                aria-label={`Open ref ${tip.name}`}
                {...pressable(() => nav.openRef(rev, tip.name))}
              >
                {gutter}
                <span className="g-title">
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
                  {mergeReady.some(
                    (id) => tip.name.includes(id) || (tip.worktree ?? '').includes(id),
                  ) && (
                    <span className="chip st-merge-ready" title="Merge-ready in the ledger">
                      {' '}
                      merge-ready
                    </span>
                  )}
                </span>
                <span className="g-who">
                  <Occupants here={here} />
                </span>
                <span className="g-ahead right">
                  {tip.ahead > 0 ? `+${tip.ahead}` : ''}
                  {tip.behind > 0 && (
                    <span
                      className={`g-behind${tip.behind >= BEHIND_WARN ? ' warn' : ''}`}
                      title={`${tip.behind} commit${tip.behind > 1 ? 's' : ''} behind ${overview.base}`}
                    >
                      {' '}
                      −{tip.behind}
                    </span>
                  )}
                </span>
                <span className="g-date">{formatSinceIso(tip.date, nowMs)}</span>
                <span className="g-sha">{tip.sha.slice(0, 9)}</span>
              </div>
            );
          }

          if (row.type === 'fold') {
            return (
              <div key={`f:${row.from}`} className={`git-row fold${needle === '' ? '' : ' dim'}`}>
                {gutter}
                <span className="g-title g-fold">··· {row.count} commits</span>
                <span />
                <span />
                <span />
                <span />
              </div>
            );
          }

          const node = row.node;
          const isHead = index === firstMain;
          return (
            // biome-ignore lint/a11y/useSemanticElements: 中にチップを持つ行は button にできない
            <div
              key={`n:${node.sha}`}
              className={`git-row${node.merge ? ' merge' : ''}${dim}`}
              /* 本文中の sha にホバーしたら、この行がハイライトされる。**完全な sha を
                 持たせる** — 突き合わせは部分一致なので、本文の桁数が短くても当たる。 */
              data-name={node.sha}
              role="button"
              tabIndex={0}
              aria-label={`Open commit ${node.sha.slice(0, 9)}`}
              {...pressable(() => nav.openRef(node.sha, node.sha.slice(0, 9)))}
            >
              {gutter}
              <span className="g-title">
                {isHead && <span className="g-base-name">{overview.base} </span>}
                <span className="g-subject" title={node.subject}>
                  <SubjectText text={node.subject} project={project} />
                </span>
              </span>
              <span className="g-who">{isHead ? <Occupants here={rootOccupants} /> : null}</span>
              <span />
              <span className="g-date">{formatSinceIso(node.date, nowMs)}</span>
              <span className="g-sha">{node.sha.slice(0, 9)}</span>
            </div>
          );
        })}
      </div>
    </>
  );
}

function Occupants({ here }: { here: readonly Occupant[] }) {
  return (
    <>
      {here.slice(0, MAX_LISTED_OCCUPANTS).map((occupant) => (
        <AgentChip
          key={occupant.file}
          file={occupant.file}
          state={occupant.state}
          label={occupant.label}
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
    <button type="button" className={className} onClick={() => onSort(sortKey)}>
      {label}
    </button>
  );
}
