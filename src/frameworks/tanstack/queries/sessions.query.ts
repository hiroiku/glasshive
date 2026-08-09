import { queryOptions } from '@tanstack/react-query';
import { getConversation } from '../functions/conversation.ts';
import { findTranscripts, getUsage } from '../functions/usage.ts';

/* 巣ひとつに紐づく問い合わせ。鍵を 1 か所に置くのは、合図が来たときに名指しで捨てるためである。 */

export const usageQueryKey = (projectId: string) => ['usage', projectId] as const;

export const usageQuery = (projectId: string) =>
  queryOptions({
    queryKey: usageQueryKey(projectId),
    queryFn: () => getUsage({ data: { projectId } }),
    /* 消費は分の単位でしか動かない。合図のたびに 8MiB を読み直す価値は無い */
    staleTime: 60_000,
  });

export const searchQuery = (projectId: string, query: string) =>
  queryOptions({
    queryKey: ['search', projectId, query] as const,
    queryFn: () => findTranscripts({ data: { projectId, query } }),
    staleTime: 30_000,
  });

/* 会話の 1 頁。**これは問い合わせの仕組みに載せない。**

   頁の鍵がバイトの位置で、向こう側で境が動く。合図で末尾が伸び、巻きの位置の持ち直しが
   描画と絡む。載せると、鍵の作り直しと巻き戻しの取り合いになる。
   ここに置いてあるのは呼び出しの形だけで、覚えは `useTranscriptWindow` が持つ。 */
export const fetchConversation = (file: string, from: number | null, to: number | null) =>
  getConversation({ data: { file, from, to } });
