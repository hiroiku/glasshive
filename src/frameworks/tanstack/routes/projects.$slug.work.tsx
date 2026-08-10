import { mdiFlagOutline, mdiGithub } from '@mdi/js';
import { useQuery } from '@tanstack/react-query';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useMemo } from 'react';
import type { GitOverviewResponse } from '~/interface/controllers/git/git.controller.ts';
import type { ProjectJson } from '~/interface/presenters/sessions/tree.presenter.ts';
import { gitQuery } from '../queries/git.query.ts';
import { githubIssuesQuery, issuesQuery } from '../queries/issues.query.ts';
import { treeQuery } from '../queries/tree.query.ts';
import { GitGraph, type GitOrder } from '../ui/components/git/GitGraph.tsx';
import { DependencyGraph } from '../ui/components/issues/DependencyGraph.tsx';
import { FlowChart } from '../ui/components/issues/FlowChart.tsx';
import { type IssueSortKey, IssuesTable } from '../ui/components/issues/IssuesTable.tsx';
import { IssuesLegend } from '../ui/components/issues/Legend.tsx';
import { Icon } from '../ui/components/primitives/Icon.tsx';
import { NotObserved } from '../ui/components/primitives/NotObserved.tsx';
import { ReadProgress } from '../ui/components/primitives/ReadProgress.tsx';
import { Milestones } from '../ui/components/work/Milestones.tsx';
import { UnitSwitch } from '../ui/components/work/UnitSwitch.tsx';
import { WorkToolbar } from '../ui/components/work/WorkToolbar.tsx';
import type { TipSortKey } from '../ui/derive/gitGraph.ts';
import { withoutClosed } from '../ui/derive/issueStatus.ts';
import { milestoneOf } from '../ui/derive/milestones.ts';
import { githubTrouble, gitTrouble, transportTrouble } from '../ui/derive/trouble.ts';
import { workerIndex } from '../ui/derive/workers.ts';
import { buildWorkJoin, type WorkJoin } from '../ui/derive/workJoin.ts';
import { useNowMs } from '../ui/hooks/useNowMs.ts';
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
  'priority',
  'type',
  'labels',
  'assignee',
  'updated',
];

const BRANCH_SORT_KEYS: readonly TipSortKey[] = ['name', 'ahead', 'date'];

/** 相対の時刻の表示を進めるためだけの時計。観測そのものは取り直さない */
const TICK_MS = 15_000;

function WorkView() {
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
  /* 統合待ちのチップは台帳から来る。台帳が無いプロジェクトではチップが出ないだけ */
  const ledger = useQuery(issuesQuery(slug, false));

  const project = tree.data?.projects.find((candidate) => candidate.id === slug);
  const workers = useMemo(() => workerIndex(project), [project]);

  const mergeReady = useMemo(() => {
    if (ledger.data?.ok !== true) return [];
    return ledger.data.body.issues
      .filter((issue) => issue.status === 'merge-ready')
      .map((issue) => issue.id)
      .filter((id): id is string => id !== null);
  }, [ledger.data]);

  const patch = (next: Partial<ProjectSearch>) => {
    void navigate({ to: '.', search: (prev: ProjectSearch) => ({ ...prev, ...next }) });
  };

  /* 単位を移るときは並べ替えを落とす。**列が違うので、持ち越すと意味が変わる** —
     課題の `updated` とブランチの `date` は別の列で、名前だけ持ち越しても当たらない。 */
  const onUnit = (unit: WorkUnit | null) =>
    patch({ unit: unit ?? undefined, sort: undefined, dir: undefined, view: undefined });

  const overview = git.data?.ok === true ? git.data.body : null;
  const page =
    issues.data?.ok === true && issues.data.body.state === 'observed' ? issues.data.body : null;
  const all = page?.issues ?? [];
  const join = useMemo(
    () => buildWorkJoin(overview?.state === 'observed' ? overview : null, all),
    [overview, all],
  );

  const branchCount = overview?.state === 'observed' ? overview.tips.length : 0;
  const issueCount = useMemo(() => withoutClosed(all).length, [all]);
  /* マイルストーンは取ってきた課題を束ね直しただけで、`gh` を余分に走らせない。
     数えるのは名前の付いているものだけ —— 付いていない課題の束は区切りではない。 */
  const milestoneCount = useMemo(
    () => new Set(all.map(milestoneOf).filter((title) => title !== null)).size,
    [all],
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

  if (search.unit === 'branches') {
    return (
      <div id="git-view">
        <Branches
          answer={git.data}
          failed={git.error !== null}
          project={project}
          mergeReady={mergeReady}
          join={join}
          lead={unitSwitch}
          query={search.q ?? ''}
          onQuery={(next) => patch({ q: next === '' ? undefined : next })}
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

  const toolbar = (chips?: React.ReactNode) => (
    <WorkToolbar
      unit={search.unit ?? null}
      onUnit={onUnit}
      issueCount={issueCount}
      branchCount={branchCount}
      milestoneCount={milestoneCount}
      graph={search.view === 'graph'}
      onGraph={(on) => patch({ view: on ? 'graph' : undefined })}
      query={search.q ?? ''}
      onQuery={(query) => patch({ q: query === '' ? undefined : query })}
    >
      {chips}
    </WorkToolbar>
  );

  /* 取りに行けなかったのと、まだ取りに行っている最中は別の事実である。**分けないと、
     失敗が永久に読み込み中の顔で残る** — 取り直しは切ってあるので、二度と変わらない。 */
  if (issues.error !== null) {
    return (
      <>
        {toolbar()}
        <NotObserved {...transportTrouble('issues')} />
      </>
    );
  }
  if (issues.data === undefined) {
    return (
      <>
        {toolbar()}
        <ReadProgress
          label="Fetching issues from GitHub"
          slowNote="gh is paging through this repository — a large one takes a few seconds"
        />
      </>
    );
  }
  if (!issues.data.ok) {
    return (
      <>
        {toolbar()}
        <NotObserved {...githubTrouble(issues.data.body.code)} />
      </>
    );
  }
  const body = issues.data.body;
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
        <NotObserved {...githubTrouble(body.reason)} />
      </>
    );
  }

  /* **取り終えてから束ねる。** 取りに行っている最中に束ねると、まだ 1 件も届いていない
     ところで「マイルストーンは 1 つも無い」と書くことになる。 */
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
            <input
              className="search"
              type="search"
              placeholder="Search milestones…"
              value={search.q ?? ''}
              onChange={(event) =>
                patch({ q: event.target.value === '' ? undefined : event.target.value })
              }
            />
          </div>
        }
        query={search.q ?? ''}
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
          title="Clear the milestone filter"
          onClick={() => patch({ ms: undefined })}
        >
          <Icon path={mdiFlagOutline} size={10} /> {search.ms} ×
        </button>
      )}
      {Object.entries(body.counts)
        .filter(([name]) => name !== 'closed')
        .map(([name, count]) => (
          <button
            key={name}
            type="button"
            className={`fchip ${search.status === name ? 'on' : ''}`}
            onClick={() => patch({ status: search.status === name ? undefined : name })}
          >
            {name} {count}
          </button>
        ))}
      <button
        type="button"
        className={`fchip ${includeClosed ? 'on' : ''}`}
        onClick={() => patch({ closed: includeClosed ? undefined : true })}
      >
        + closed {body.counts.closed ?? 0}
      </button>
    </>
  );

  return (
    <>
      {toolbar(chips)}
      {/* 上限に当たったなら黙らない。黙ると、その先の課題が「無かった」ことになる */}
      {body.truncated && (
        <p className="empty truncated">
          Showing the most recently updated issues only — this repository has more than glasshive
          fetches in one go.
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
          onQuery={(query) => patch({ q: query === '' ? undefined : query })}
          status={search.status ?? null}
          order={order}
          onSort={onSort}
          nowMs={nowMs}
          firstPaint={false}
        />
      )}

      {/* 一覧のときだけ、弧とチップの読み方を下に出す。グラフは自分の凡例を持っている */}
      {search.view !== 'graph' && (
        <IssuesLegend complete={shown.every((issue) => issue.deps_complete)} />
      )}

      {/* 累積フローは常にここに在る。押して出すものにすると、押さない限り
          「増えているのか減っているのか」が誰にも見えない */}
      <FlowChart issues={body.issues} nowMs={nowMs} />
    </>
  );
}

interface BranchesProps {
  readonly answer: GitOverviewResponse | undefined;
  readonly failed: boolean;
  readonly project: ProjectJson | undefined;
  readonly mergeReady: readonly string[];
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
  mergeReady,
  join,
  lead,
  query,
  onQuery,
  sort,
  dir,
  onSort,
  nowMs,
}: BranchesProps) {
  if (failed) return <NotObserved {...transportTrouble('the repository')} />;
  if (answer === undefined) return <ReadProgress label="Reading branches and worktrees" />;
  /* 観測できなかったのはリポジトリの話ではない。`git` が無い・権限が無いはここへ来る */
  if (!answer.ok) return <NotObserved {...gitTrouble(answer.body.code)} />;

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
      mergeReady={mergeReady}
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
  return (
    <NotObserved
      icon={mdiGithub}
      title="No GitHub repository behind this project"
      detail="glasshive asks the remotes where this project lives, and none of them point at GitHub. Branches and worktrees are still readable — switch to Branches above."
      steps={[
        { text: 'Point a remote at a GitHub repository', command: 'git remote -v' },
        {
          text: 'Then this side fills in: the dependency graph, start order, and which agent is on which issue',
        },
      ]}
    />
  );
}

/** git のリポジトリでないディレクトリ。これも失敗ではない */
function NotARepository() {
  return (
    <NotObserved
      icon={mdiGithub}
      title="Not a git repository"
      detail="This project directory has no repository, so there are no branches, worktrees or conflicts to draw."
      steps={[{ text: 'Start one', command: 'git init' }]}
    />
  );
}
