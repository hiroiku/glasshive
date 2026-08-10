import { mdiSourceBranch } from '@mdi/js';
import { useQuery } from '@tanstack/react-query';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useMemo } from 'react';
import { gitQuery } from '../queries/git.query.ts';
import { issuesQuery } from '../queries/issues.query.ts';
import { treeQuery } from '../queries/tree.query.ts';
import { GitGraph, type GitOrder } from '../ui/components/git/GitGraph.tsx';
import { Icon } from '../ui/components/primitives/Icon.tsx';
import type { TipSortKey } from '../ui/derive/gitGraph.ts';
import { useNowMs } from '../ui/hooks/useNowMs.ts';
import type { ProjectSearch } from '../ui/nav/search.ts';

/* Git の画面。

   **リポジトリでないことと、`git` がインストールされていないことを分けて見せる。**
   同じ結果に潰すと、`git` の入っていない機械では、すべてのプロジェクトが
   「リポジトリでない」と出る。 */

export const Route = createFileRoute('/projects/$slug/git')({
  component: GitView,
});

/** 検索パラメータが何も言っていないときの並び。新しい順 */
const DEFAULT_ORDER: GitOrder = { key: 'date', direction: 'desc' };

const SORT_KEYS: readonly TipSortKey[] = ['name', 'ahead', 'date'];

/** 相対時刻の表示と、点の明滅を進めるための時計 */
const TICK_MS = 5000;

function GitView() {
  const { slug } = Route.useParams();
  const search: ProjectSearch = Route.useSearch();
  const navigate = useNavigate();
  const nowMs = useNowMs(TICK_MS);

  const tree = useQuery(treeQuery);
  const git = useQuery(gitQuery(slug));
  /* 統合待ちのチップは台帳から来る。台帳が無いプロジェクトではチップが出ないだけで、線は出る */
  const ledger = useQuery(issuesQuery(slug, false));

  const project = tree.data?.projects.find((candidate) => candidate.id === slug);
  const mergeReady = useMemo(() => {
    if (ledger.data?.ok !== true) return [];
    return ledger.data.body.issues
      .filter((issue) => issue.status === 'merge-ready')
      .map((issue) => issue.id)
      .filter((id): id is string => id !== null);
  }, [ledger.data]);

  const patch = (next: Partial<ProjectSearch>) => {
    void navigate({
      to: '.',
      search: (prev: ProjectSearch) => ({ ...prev, ...next }),
    });
  };

  const sortKey = SORT_KEYS.find((key) => key === search.sort);
  const order: GitOrder =
    sortKey === undefined
      ? DEFAULT_ORDER
      : { key: sortKey, direction: search.dir === 'asc' ? 'asc' : 'desc' };

  const onSort = (key: TipSortKey) => {
    // 同じ列をもう一度押したら向きが返る。名前だけは昇順から始める
    const flip =
      order.key === key
        ? order.direction === 'asc'
          ? 'desc'
          : 'asc'
        : key === 'name'
          ? 'asc'
          : 'desc';
    patch({ sort: key, dir: flip });
  };

  const answer = git.data;
  if (answer === undefined) {
    return (
      <div id="git-view">
        <p className="empty">Loading…</p>
      </div>
    );
  }
  /* 観測できなかったのはリポジトリの話ではない。`git` が無い・権限が無いはここへ来る */
  if (!answer.ok) {
    return (
      <div id="git-view">
        <p className="empty">Could not read the repository ({answer.body.code})</p>
      </div>
    );
  }
  const overview = answer.body;
  if (overview.state === 'absent') {
    return (
      <div id="git-view">
        <GitPromo />
      </div>
    );
  }

  return (
    <div id="git-view">
      <GitGraph
        overview={overview}
        project={project}
        mergeReady={mergeReady}
        query={search.q ?? ''}
        onQuery={(next) => patch({ q: next === '' ? undefined : next })}
        order={order}
        onSort={onSort}
        nowMs={nowMs}
      />
    </div>
  );
}

/* リポジトリでないプロジェクト。**無いことは失敗ではない。** */
function GitPromo() {
  return (
    <div className="bd-promo git">
      <div className="bp-title">
        <Icon path={mdiSourceBranch} size={13} /> Not a git repository
      </div>
      <p>
        Run <code>git init</code> (or open a project that has a repository) and this view lights up:
        worktrees and branches drawn as living lines over the mainline, which agents occupy which
        worktree, and ref details with diff stats and agent activity timelines.
      </p>
      <a href="https://git-scm.com" target="_blank" rel="noopener">
        git-scm.com →
      </a>
    </div>
  );
}
