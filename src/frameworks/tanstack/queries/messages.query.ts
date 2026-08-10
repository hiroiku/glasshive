import { queryOptions } from '@tanstack/react-query';
import { getMessages } from '../functions/messages.ts';

/* エージェント間メッセージの問い合わせ。

   `transcript` を丸ごと開くので、変更通知では配らない。**ユーザーが求めたときだけ**
   取りに行き、少し置いてから取り直す。 */

export const messagesQuery = (projectId: string, sessionId: string) =>
  queryOptions({
    queryKey: ['messages', projectId, sessionId] as const,
    queryFn: () => getMessages({ data: { projectId, sessionId } }),
    staleTime: 20_000,
  });
