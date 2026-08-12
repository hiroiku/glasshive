import { mdiFlagOutline, mdiGithub } from '@mdi/js';
import { useQuery } from '@tanstack/react-query';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useMemo } from 'react';
import type { GitOverviewResponse } from '~/interface/controllers/git/git.controller.ts';
import type { Translator } from '~/interface/i18n/translator.ts';
import type { IssuesJson } from '~/interface/presenters/issues/issues.presenter.ts';
import type { ProjectJson } from '~/interface/presenters/sessions/tree.presenter.ts';
import { gitQuery } from '../queries/git.query.ts';
import { githubIssueEventsQuery, githubIssuesQuery } from '../queries/issues.query.ts';
import { treeQuery } from '../queries/tree.query.ts';
import { GitGraph, type GitOrder } from '../ui/components/git/GitGraph.tsx';
import { DependencyGraph } from '../ui/components/issues/DependencyGraph.tsx';
import { FlowChart } from '../ui/components/issues/FlowChart.tsx';
import { type IssueSortKey, IssuesTable } from '../ui/components/issues/IssuesTable.tsx';
import { IssuesLegend } from '../ui/components/issues/Legend.tsx';
import { Icon } from '../ui/components/primitives/Icon.tsx';
import { NotObserved } from '../ui/components/primitives/NotObserved.tsx';
import {
  countScan,
  ReadProgress,
  type ReadScan,
} from '../ui/components/primitives/ReadProgress.tsx';
import { SearchInput } from '../ui/components/primitives/SearchInput.tsx';
import { Milestones } from '../ui/components/work/Milestones.tsx';
import type { UnitCount } from '../ui/components/work/UnitSwitch.tsx';
import { UnitSwitch } from '../ui/components/work/UnitSwitch.tsx';
import { SpanChips, WorkToolbar } from '../ui/components/work/WorkToolbar.tsx';
import type { TipSortKey } from '../ui/derive/gitGraph.ts';
import { eventLogOf } from '../ui/derive/issueEvents.ts';
import { DEFAULT_GANTT_WINDOW, GANTT_WINDOWS, type GanttWindow } from '../ui/derive/issueGantt.ts';
import { withoutClosed } from '../ui/derive/issueStatus.ts';
import { statusLabel } from '../ui/derive/labels.ts';
import { milestoneOf } from '../ui/derive/milestones.ts';
import { githubTrouble, gitTrouble, transportTrouble } from '../ui/derive/trouble.ts';
import { workerIndex } from '../ui/derive/workers.ts';
import { buildWorkJoin, type GitReach, type WorkJoin } from '../ui/derive/workJoin.ts';
import { useNowMs } from '../ui/hooks/useNowMs.ts';
import { useT } from '../ui/i18n/useT.ts';
import { useNav } from '../ui/nav/NavContext.tsx';
import type { ProjectSearch, WorkUnit } from '../ui/nav/search.ts';

/* 作業の画面。**課題とブランチを 1 つの画面に置く。**

   課題は「なぜやるか」、ブランチは「どこでやっているか」で、PR がその 2 つを繋いでいる。
   別々のタブに置くと繋ぎ目を人が頭の中で持つことになるので、行の単位を切り替える形にして
   ある。どちらの単位でも、列も左の溝の絵もそれぞれのものがそのまま残る。

   取ってくるものは両方の単位で同じである —— 切り替えのたびに取り直さない。 */

export const Route = createFileRoute('/projects/$slug/work')({
  component: WorkView,
});

/** 課題の既定の並び。最後に更新された順 */
const ISSUE_ORDER = { key: 'updated', direction: 'desc' } as const;

/** ブランチの既定の並び。新しい順 */
const BRANCH_ORDER: GitOrder = { key: 'date', direction: 'desc' };

const ISSUE_SORT_KEYS: readonly IssueSortKey[] = [
  'start',
  'id',
  'title',
  'status',
  'type',
  'labels',
  'assignee',
  'updated',
];

const BRANCH_SORT_KEYS: readonly TipSortKey[] = ['name', 'ahead', 'date'];

/** 相対の時刻の表示を進めるためだけの時計。観測そのものは取り直さない */
const TICK_MS = 15_000;

/* GitHub をどこまで歩いたか。**数えているのは受け取った課題で、一覧に並んだ行ではない** ——
   閉じた課題は一覧から落ちるし、絞り込めば更に減る。バーは歩きを測り、一覧は見つかったものを
   出す。この 2 つが合わないのは正しい。

   総数を答えてもらえなかったときは `null` を返して、輪郭だけのバーに戻す。 */
const issuesScan = (t: Translator, body: IssuesJson | undefined): ReadScan | null =>
  countScan(t, body?.progress?.fetched_issues ?? 0, body?.progress?.total_issues, t('issues'));

function WorkView() {
  const t = useT();
  const { slug } = Route.useParams();
  const search: ProjectSearch = Route.useSearch();
  const navigate = useNavigate();
  const nowMs = useNowMs(TICK_MS);
  const nav = useNav();

  const tree = useQuery(treeQuery);
  const git = useQuery(gitQuery(slug));
  /* **1 回しか取りに行かない。** `gh` の起動と GitHub への往復はこの画面で最も高く、
     閉じたものを含めるかどうかで取ってくる中身は変わらない。絞り込みはここでやる。 */
  const issues = useQuery(githubIssuesQuery(slug, true));
  /* 課題に起きたことは一覧と別に尋ねる。**一覧をこれで待たせない** —— `gh` の往復 2 回ぶんを
     待ってから開く一覧は、待った価値のあるものにならない。右のトラックは答えが返ってきた
     ときに埋まり、それまでは「読んでいる最中」を描く。 */
  const events = useQuery(githubIssueEventsQuery(slug));
  /* 読んでいる最中かどうかは、届いた記録の `walked` が言う。**`isFetching` から採らない**
     —— 取り直しの間も前の記録を出したままにしてあるので、読み終えた記録の上で取得中になる。
     `isPending` が答えるのは、まだ 1 枚も受け取っていないときだけである。 */
  const eventLog = useMemo(
    () => eventLogOf(events.isPending, events.error !== null, events.data ?? null),
    [events.isPending, events.error, events.data],
  );

  const project = tree.data?.projects.find((candidate) => candidate.id === slug);
  const workers = useMemo(() => workerIndex(project), [project]);
  /* エージェントの欄が空なのは、誰も触っていないからとは限らない。`~/.claude/projects` を
     走査できていなければ、この画面はそもそも誰も観ていない。**課題そのものは GitHub から
     読めている**ので画面は出るが、その空欄だけは観測ではない。 */
  const workersUnobservable =
    tree.data?.sources.state === 'unobservable' || project?.sources.state === 'unobservable';

  const patch = (next: Partial<ProjectSearch>) => {
    void navigate({ to: '.', search: (prev: ProjectSearch) => ({ ...prev, ...next }) });
  };

  /* 検索語だけは履歴を積まずに置き換える。**1 文字が 1 つの行き先ではない** —
     積むと 10 文字打った人は戻るを 10 回押すことになり、打つ前の画面へ戻れなくなる。 */
  const onQuery = (next: string) => {
    void navigate({
      to: '.',
      replace: true,
      search: (prev: ProjectSearch) => ({ ...prev, q: next === '' ? undefined : next }),
    });
  };

  /* 単位を移るときは並べ替えを落とす。**列が違うので、持ち越すと意味が変わる** —
     課題の `updated` とブランチの `date` は別の列で、名前だけ持ち越しても当たらない。 */
  const onUnit = (unit: WorkUnit | null) =>
    patch({ unit: unit ?? undefined, sort: undefined, dir: undefined, view: undefined });

  const overview = git.data?.ok === true ? git.data.body : null;
  /* 届いたページまでの一覧。**読み終えるのを待たない** —— ページ 1 の 100 件を出さずに
     置いておく理由が無い。まだ途中であることは、値そのものが持つ `walked` が言う。 */
  const page = issues.data?.state === 'observed' ? issues.data : null;
  const all = page?.issues ?? [];

  /* 手元の git をどこまで観測できたか。**`absent` はここでは観測できたほうに入る** ——
     git のリポジトリでないディレクトリにブランチが 0 本なのは、観測して言える事実である。
     観測できなかったことは 200 では返らないので、`overview` が無いことがそれに当たる。 */
  const gitReach: GitReach =
    git.error !== null
      ? 'unobservable'
      : git.data === undefined
        ? 'pending'
        : overview === null
          ? 'unobservable'
          : 'observed';

  const join = useMemo(
    () => buildWorkJoin(overview?.state === 'observed' ? overview : null, gitReach, all),
    [overview, gitReach, all],
  );

  /* 切り替えに添える件数。**数えられていないことを 0 で表さない** —— 0 は「向こうに 1 件も
     無い」という断定なので、読めていないときに出すと、切り替える必要が無いように読める。 */
  const branchCount: UnitCount =
    gitReach === 'observed'
      ? overview?.state === 'observed'
        ? overview.tips.length
        : 0
      : gitReach;
  /* 読み終えるまでは `pending` のままにする。**届いたぶんの件数を切り替えに出さない** ——
     数はそこで確定したものとして読まれるので、途中の数を出すと、増えていく数がちらつく。 */
  const issuePresence: UnitCount | null =
    issues.error !== null
      ? 'unobservable'
      : issues.data === undefined || !issues.data.walked
        ? 'pending'
        : issues.data.state === 'unobservable'
          ? 'unobservable'
          : null;
  const issueCount = useMemo<UnitCount>(
    () => issuePresence ?? withoutClosed(all).length,
    [issuePresence, all],
  );
  /* マイルストーンは取ってきた課題を束ね直しただけで、`gh` を余分に走らせない。
     数えるのは名前の付いているものだけ —— 付いていない課題の束は区切りではない。 */
  const milestoneCount = useMemo<UnitCount>(
    () => issuePresence ?? new Set(all.map(milestoneOf).filter((title) => title !== null)).size,
    [issuePresence, all],
  );

  const unitSwitch = (
    <UnitSwitch
      unit={search.unit ?? null}
      onUnit={onUnit}
      issueCount={issueCount}
      branchCount={branchCount}
      milestoneCount={milestoneCount}
    />
  );

  /* エージェントの欄が空であることを、誰も触っていないことにしない。**課題もブランチも
     読めていて、読めていないのは `transcript` のほうである** —— 画面はほとんど埋まるので、
     言わないと空欄だけが観測の顔で残る。 */
  const workersNote = workersUnobservable ? (
    <p className="empty truncated">
      {t(
        'The agent columns are blank because the transcripts could not be read — not because nobody is working on these.',
      )}
    </p>
  ) : null;

  if (search.unit === 'branches') {
    return (
      <div id="git-view">
        {workersNote}
        <Branches
          answer={git.data}
          failed={git.error !== null}
          project={project}
          join={join}
          lead={unitSwitch}
          query={search.q ?? ''}
          onQuery={onQuery}
          sort={search.sort}
          dir={search.dir}
          onSort={(key, dir) => patch({ sort: key, dir })}
          nowMs={nowMs}
        />
      </div>
    );
  }

  const sortKey = ISSUE_SORT_KEYS.find((key) => key === search.sort);
  const order =
    sortKey === undefined
      ? ISSUE_ORDER
      : { key: sortKey, direction: search.dir === 'asc' ? ('asc' as const) : ('desc' as const) };

  const onSort = (key: IssueSortKey) => {
    if (key === 'start') {
      patch({ sort: order.key === 'start' ? undefined : 'start', dir: undefined });
      return;
    }
    const flip = order.key === key && order.direction === 'asc' ? 'desc' : 'asc';
    patch({ sort: key, dir: flip });
  };

  /* タイムラインの幅は URL に載る。**渡した先でも同じ軸が出る** —— 幅が違えば同じ一覧でも
     バーの長さが変わるので、「この期間で見て」と言えないと画面を渡す意味が薄れる。
     既定のときはパラメータを落として、URL に既定の値が居座らないようにする。 */
  const ganttWindow =
    GANTT_WINDOWS.find((preset) => preset.label === search.gw)?.key ?? DEFAULT_GANTT_WINDOW;

  const onGantt = (next: GanttWindow) => {
    const label = GANTT_WINDOWS.find((preset) => preset.key === next)?.label;
    patch({ gw: next === DEFAULT_GANTT_WINDOW ? undefined : label });
  };

  const toolbar = (chips?: React.ReactNode) => (
    <>
      <WorkToolbar
        unit={search.unit ?? null}
        onUnit={onUnit}
        issueCount={issueCount}
        branchCount={branchCount}
        milestoneCount={milestoneCount}
        graph={search.view === 'graph'}
        onGraph={(on) => patch({ view: on ? 'graph' : undefined })}
        gantt={ganttWindow}
        onGantt={onGantt}
        group={search.group ?? null}
        onGroup={(next) => patch({ group: next ?? undefined })}
        query={search.q ?? ''}
        onQuery={onQuery}
      >
        {chips}
      </WorkToolbar>
      {workersNote}
    </>
  );

  /* 取りに行けなかったのと、まだ取りに行っている最中は別の事実である。**分けないと、
     失敗が永久に読み込み中の顔で残る** — 取り直しは切ってあるので、二度と変わらない。 */
  if (issues.error !== null) {
    return (
      <>
        {toolbar()}
        <NotObserved {...transportTrouble(t, t('issues'))} />
      </>
    );
  }
  /* 1 ページも届いていないあいだだけ、バーで待つ。**1 件でも届いたら行を出す** ——
     ページ 1 の 100 件を隠して置いておく理由が無い。まだ途中であることは、行の下で言う。 */
  if (issues.data === undefined || (!issues.data.walked && issues.data.issues.length === 0)) {
    return (
      <>
        {toolbar()}
        <ReadProgress
          label={t('Fetching issues from GitHub')}
          slowNote={t('gh is paging through this repository — a large one takes a few seconds')}
          scan={issuesScan(t, issues.data)}
        />
      </>
    );
  }
  const body = issues.data;
  // このプロジェクトが GitHub のリポジトリを指していない。無いことは失敗ではない
  if (body.state === 'absent') {
    return (
      <>
        {toolbar()}
        <NoRepository />
      </>
    );
  }
  if (body.state === 'unobservable') {
    return (
      <>
        {toolbar()}
        <NotObserved {...githubTrouble(t, body.reason)} />
      </>
    );
  }

  /* 行は届いたぶんから出せるが、全件が揃って初めて成り立つ導出はそうはいかない。**依存の弧も、
     着手順の束も、マイルストーンの束も、まだ届いていない課題のぶんが黙って落ちる** —— 堰き
     止められている課題が `Ready now` に並び、まだ届いていないマイルストーンが「無い」になる。 */
  if (
    !body.walked &&
    (search.view === 'graph' || search.unit === 'milestones' || order.key === 'start')
  ) {
    return (
      <>
        {toolbar()}
        <ReadProgress
          label={t('Fetching the rest of the issues from GitHub')}
          slowNote={t(
            'this view needs every issue — the dependencies and milestones are read from the whole list',
          )}
          scan={issuesScan(t, body)}
        />
      </>
    );
  }

  if (search.unit === 'milestones') {
    return (
      <Milestones
        issues={body.issues}
        workers={workers}
        join={join}
        project={project}
        lead={
          <div className="view-toolbar">
            {unitSwitch}
            <SearchInput
              value={search.q ?? ''}
              onChange={onQuery}
              placeholder={t('Search milestones…')}
            />
            <SpanChips gantt={ganttWindow} onGantt={onGantt} />
          </div>
        }
        query={search.q ?? ''}
        ganttWindow={ganttWindow}
        eventLog={eventLog}
        nowMs={nowMs}
      />
    );
  }

  /* マイルストーンで絞るのは、状態や検索語より先に効く。**一覧そのものを狭める** —
     区切りを選んで来た人が見たいのは、その区切りに属する課題の全部だからである。 */
  const inMilestone =
    search.ms === undefined
      ? body.issues
      : body.issues.filter((issue) => milestoneOf(issue) === search.ms);
  const open = withoutClosed(inMilestone);
  const includeClosed = search.closed === true;
  const shown = includeClosed ? inMilestone : open;

  const chips = (
    <>
      {/* 絞っていることを黙らない。黙ると、足りない一覧が全部の一覧として読まれる */}
      {search.ms !== undefined && (
        <button
          type="button"
          className="fchip on ms-chip"
          /* 中身は絞り込んでいる名前しか言わない。**押すと何が起きるかは名前で言う** ——
             読み上げに「1.4 — Ingest ×」とだけ渡すと、外すボタンだと分からない */
          aria-label={t('Clear the milestone filter: {name}', { name: search.ms })}
          title={t('Clear the milestone filter')}
          onClick={() => patch({ ms: undefined })}
        >
          <Icon path={mdiFlagOutline} size={10} /> {search.ms} ×
        </button>
      )}
      {/* 読み終えるまで、件数は `—` にする。**途中の数を数として出さない** —— チップの脇の数は
          そこで数え終えたものとして読まれるので、ページが届くたびに増える数を置くと、
          `open 40` を見た人が 40 件だと思う。数えられていないことは `UnitSwitch` と同じ形で言う。 */}
      {Object.entries(body.counts)
        .filter(([name]) => name !== 'closed')
        .map(([name, count]) => (
          <button
            key={name}
            type="button"
            className={`fchip ${search.status === name ? 'on' : ''}`}
            /* 押されているかは色でしか出ていない。読み上げにも同じことを言わせる */
            aria-pressed={search.status === name}
            onClick={() => patch({ status: search.status === name ? undefined : name })}
          >
            {statusLabel(t, name)} {body.walked ? count : '—'}
          </button>
        ))}
      <button
        type="button"
        className={`fchip ${includeClosed ? 'on' : ''}`}
        aria-pressed={includeClosed}
        onClick={() => patch({ closed: includeClosed ? undefined : true })}
      >
        + {t('closed')} {body.walked ? (body.counts.closed ?? 0) : '—'}
      </button>
    </>
  );

  return (
    <>
      {toolbar(chips)}
      {/* GitHub を指す remote が 2 つ以上あって、どれを尋ねるかを glasshive が選んだ。
       **選んだことを黙らない** —— 黙ると、選ばなかったほうの課題が「無い」ことになる */}
      {body.other_repositories > 0 && body.repository !== null && (
        <p className="empty truncated">
          {t('Reading issues from')} <code>{body.repository}</code>
          {t(
            '. This project’s remotes point at {n} GitHub repositories — run `gh repo set-default` to change which one glasshive reads.',
            { n: body.other_repositories + 1 },
          )}
        </p>
      )}
      {/* 上限に当たったなら黙らない。黙ると、その先の課題が「無かった」ことになる */}
      {body.truncated && (
        <p className="empty truncated">
          {t(
            'Showing the most recently updated issues only — this repository has more than glasshive fetches in one go.',
          )}
        </p>
      )}

      {/* **依存の絵に閉じた課題を混ぜない** — 片付いた相手が堰き止め続けることになる */}
      {search.view === 'graph' ? (
        <DependencyGraph issues={open} workers={workers} onOpen={nav.openIssue} join={join} />
      ) : (
        <IssuesTable
          issues={shown}
          all={body.issues}
          project={project}
          workers={workers}
          join={join}
          query={search.q ?? ''}
          onQuery={onQuery}
          status={search.status ?? null}
          order={order}
          onSort={onSort}
          ganttWindow={ganttWindow}
          eventLog={eventLog}
          group={search.group}
          nowMs={nowMs}
          firstPaint={false}
        />
      )}

      {/* 一覧のときだけ、弧とチップの読み方を下に出す。グラフは自分の凡例を持っている */}
      {search.view !== 'graph' && (
        <IssuesLegend
          complete={body.walked && shown.every((issue) => issue.deps_complete)}
          events={eventLog}
        />
      )}

      {/* 累積フローは常にここに在る。押して出すものにすると、押さない限り
          「増えているのか減っているのか」が誰にも見えない */}
      {body.walked ? (
        <FlowChart issues={body.issues} nowMs={nowMs} />
      ) : (
        <ReadProgress
          label={t('Fetching the rest of the issues — the cumulative flow counts all of them')}
          scan={issuesScan(t, body)}
        />
      )}
    </>
  );
}

interface BranchesProps {
  readonly answer: GitOverviewResponse | undefined;
  readonly failed: boolean;
  readonly project: ProjectJson | undefined;
  readonly join: WorkJoin;
  readonly lead: React.ReactNode;
  readonly query: string;
  readonly onQuery: (query: string) => void;
  readonly sort: string | undefined;
  readonly dir: 'asc' | 'desc' | undefined;
  readonly onSort: (key: TipSortKey, dir: 'asc' | 'desc') => void;
  readonly nowMs: number;
}

function Branches({
  answer,
  failed,
  project,
  join,
  lead,
  query,
  onQuery,
  sort,
  dir,
  onSort,
  nowMs,
}: BranchesProps) {
  const t = useT();
  if (failed) return <NotObserved {...transportTrouble(t, t('the repository'))} />;
  if (answer === undefined) return <ReadProgress label={t('Reading branches and worktrees')} />;
  /* 観測できなかったのはリポジトリの話ではない。`git` が無い・権限が無いはここへ来る */
  if (!answer.ok) return <NotObserved {...gitTrouble(t, answer.body.code)} />;

  const overview = answer.body;
  if (overview.state === 'absent') return <NotARepository />;

  const sortKey = BRANCH_SORT_KEYS.find((key) => key === sort);
  const order: GitOrder =
    sortKey === undefined
      ? BRANCH_ORDER
      : { key: sortKey, direction: dir === 'asc' ? 'asc' : 'desc' };

  return (
    <GitGraph
      overview={overview}
      project={project}
      join={join}
      lead={lead}
      query={query}
      onQuery={onQuery}
      order={order}
      onSort={(key) => {
        // 同じ列をもう一度押したら向きが返る。名前だけは昇順から始める
        const flip =
          order.key === key
            ? order.direction === 'asc'
              ? 'desc'
              : 'asc'
            : key === 'name'
              ? 'asc'
              : 'desc';
        onSort(key, flip);
      }}
      nowMs={nowMs}
    />
  );
}

/* GitHub のリポジトリを指していないプロジェクト。**無いことは失敗ではない。**

   手元だけのリポジトリも、GitHub 以外に置いてあるリポジトリも珍しくない。何をすれば
   この画面が埋まるのかを書いておくと、空である理由と手立てが同時に読める。 */
function NoRepository() {
  const t = useT();
  return (
    <NotObserved
      icon={mdiGithub}
      title={t('No GitHub repository behind this project')}
      detail={t(
        'glasshive asks the remotes where this project lives, and none of them point at GitHub. Branches and worktrees are still readable — switch to Branches above.',
      )}
      steps={[
        { text: t('Point a remote at a GitHub repository'), command: 'git remote -v' },
        {
          text: t(
            'Then this side fills in: the dependency graph, start order, and which agent is on which issue',
          ),
        },
      ]}
    />
  );
}

/** git のリポジトリでないディレクトリ。これも失敗ではない */
function NotARepository() {
  const t = useT();
  return (
    <NotObserved
      icon={mdiGithub}
      title={t('Not a git repository')}
      detail={t(
        'This project directory has no repository, so there are no branches, worktrees or conflicts to draw.',
      )}
      steps={[{ text: t('Start one'), command: 'git init' }]}
    />
  );
}
