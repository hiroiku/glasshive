import { queryOptions, experimental_streamedQuery as streamedQuery } from '@tanstack/react-query';
import type { TreeChunkJson, TreeJson } from '~/interface/presenters/sessions/tree.presenter.ts';
import { getTreeStream } from '../functions/tree.ts';

/* 木の問い合わせ。`queryKey` を 1 か所に置くのは、変更通知が来たときにここを
   名指しで捨てるためである。

   届き方はストリームである。最初のチャンクが着いた時点で `success` になり、最後まで
   届くまで `fetchStatus` は `fetching` のまま残る。**その 2 つが別々に分かるので、
   「もう描いてよい」と「まだ途中である」を同じ 1 つの問い合わせから言える。** */

export const treeQueryKey = ['tree'] as const;

/** 最初のチャンクが着くまでの姿。行はまだ 1 つも無く、読み終えてもいない */
const EMPTY: TreeJson = {
  generated_at: '',
  active_threshold_secs: 0,
  sources: { state: 'absent', reason: 'no-source' },
  processes: { state: 'absent', reason: 'no-source' },
  complete: false,
  progress: null,
  projects: [],
};

/* チャンクを 1 枚の木へ畳む。

   **先に届いた木が敷いた行を、後から届いたプロジェクトが置き換えるだけである。** 行を
   足しも消しもしないので、途中のどの姿でも並んでいる行の集合は変わらない。 */
export function reduceTree(current: TreeJson, chunk: TreeChunkJson): TreeJson {
  if (chunk.kind === 'tree') return chunk.tree;
  if (chunk.kind === 'complete') return { ...current, complete: true, progress: null };
  return {
    ...current,
    progress: {
      read_transcripts: chunk.read_transcripts,
      total_transcripts: chunk.total_transcripts,
    },
    projects: current.projects.map((project) =>
      project.id === chunk.project.id ? chunk.project : project,
    ),
  };
}

export const treeQuery = queryOptions({
  queryKey: treeQueryKey,
  queryFn: streamedQuery({
    streamFn: () => getTreeStream(),
    reducer: reduceTree,
    initialValue: EMPTY,
    /* 取り直しの間、前の木を出したままにする。**`reset` にしない** — 変更通知のたびに
       画面が空になり、読み終えるまで何も無いところへ戻ってしまう。 */
    refetchMode: 'replace',
  }),
});
