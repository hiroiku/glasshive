import { queryOptions } from '@tanstack/react-query';
import { getConversation } from '../functions/conversation.ts';
import { findTranscripts, getUsage } from '../functions/usage.ts';

/* プロジェクト 1 つに紐づく問い合わせ。`queryKey` を 1 か所に置くのは、変更通知が来たときに
   名指しで捨てるためである。 */

export const usageQueryKey = (projectId: string) => ['usage', projectId] as const;

export const usageQuery = (projectId: string) =>
  queryOptions({
    queryKey: usageQueryKey(projectId),
    queryFn: () => getUsage({ data: { projectId } }),
    /* 消費は分の単位でしか動かない。変更通知のたびに 8MiB を読み直す価値は無い */
    staleTime: 60_000,
  });

/* 検索の 1 区切り。**これも `useQuery` に載せない。**

   ページのキーが読み始める位置で、打ち込むたびに走っている読み取りを捨てて最初からやり直す。
   当たりは区切りをまたいで貯めるので、キャッシュに置くのは 1 区切りぶんの答えでしかない。
   状態は `useDeepSearch` が持つ。 */
export const fetchSearch = (projectId: string, query: string, offset: number) =>
  findTranscripts({ data: { projectId, query, offset } });

/* 会話の 1 ページ。**これは `useQuery` に載せない。**

   ページのキーがバイト位置で、向こう側で境が動く。変更通知で末尾が伸び、スクロール位置の復元が
   描画と絡む。載せると、キャッシュキーの作り直しとスクロール位置の復元が取り合いになる。
   ここに置いてあるのは呼び出しの形だけで、状態は `useTranscriptWindow` が持つ。 */
export const fetchConversation = (file: string, from: number | null, to: number | null) =>
  getConversation({ data: { file, from, to } });
