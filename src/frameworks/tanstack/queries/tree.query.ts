import { queryOptions } from '@tanstack/react-query';
import { getTree } from '../functions/tree.ts';

/* 木の問い合わせ。`queryKey` を 1 か所に置くのは、変更通知が来たときにここを
   名指しで捨てるためである。 */

export const treeQueryKey = ['tree'] as const;

export const treeQuery = queryOptions({
  queryKey: treeQueryKey,
  queryFn: () => getTree(),
});
