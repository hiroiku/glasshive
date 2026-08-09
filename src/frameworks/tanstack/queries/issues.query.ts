import { queryOptions } from '@tanstack/react-query';
import { getIssue, getIssues } from '../functions/issues.ts';

/* 課題の問い合わせ。

   閉じたものを含めるかを鍵に混ぜてあるのは、含める・含めないで**答えが違う**からである。
   混ぜないと、札の索きのために全部を取った答えが、一覧の答えとして使い回される。 */

export const issuesQueryKey = (projectId: string, includeClosed: boolean) =>
  ['issues', projectId, includeClosed] as const;

export const issuesQuery = (projectId: string, includeClosed: boolean) =>
  queryOptions({
    queryKey: issuesQueryKey(projectId, includeClosed),
    queryFn: () => getIssues({ data: { projectId, includeClosed } }),
    /* 台帳は人の手で動く。正本ほど頻繁には変わらないので、合図を待たずに少し置く */
    staleTime: 60_000,
  });

export const issueQuery = (projectId: string, id: string) =>
  queryOptions({
    queryKey: ['issue', projectId, id] as const,
    queryFn: () => getIssue({ data: { projectId, id } }),
    staleTime: 60_000,
  });
