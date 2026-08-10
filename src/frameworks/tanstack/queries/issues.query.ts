import { queryOptions } from '@tanstack/react-query';
import { getGithubIssues, getIssue, getIssues } from '../functions/issues.ts';

/* 課題の問い合わせ。

   閉じたものを含めるかを `queryKey` に混ぜてあるのは、含める・含めないで**結果が違う**
   からである。混ぜないと、チップのインデックスのために全部を取った結果が、一覧の結果として
   使い回される。 */

export const issuesQueryKey = (projectId: string, includeClosed: boolean) =>
  ['issues', projectId, includeClosed] as const;

export const issuesQuery = (projectId: string, includeClosed: boolean) =>
  queryOptions({
    queryKey: issuesQueryKey(projectId, includeClosed),
    queryFn: () => getIssues({ data: { projectId, includeClosed } }),
    /* 台帳は人の手で動く。`transcript` ほど頻繁には変わらないので、変更通知を待たずに少し置く */
    staleTime: 60_000,
  });

/* GitHub の課題。台帳より置く時間を長くしてある — 相手はネットワークの向こうで、
   取り直すたびに `gh` の起動と API の呼び出しが要る。 */
export const githubIssuesQuery = (projectId: string, includeClosed: boolean) =>
  queryOptions({
    queryKey: ['github-issues', projectId, includeClosed] as const,
    queryFn: () => getGithubIssues({ data: { projectId, includeClosed } }),
    staleTime: 300_000,
  });

export const issueQuery = (projectId: string, id: string) =>
  queryOptions({
    queryKey: ['issue', projectId, id] as const,
    queryFn: () => getIssue({ data: { projectId, id } }),
    staleTime: 60_000,
  });
