import { queryOptions } from '@tanstack/react-query';
import {
  getGithubIssueBody,
  getGithubIssueDiscussion,
  getGithubIssueEvents,
  getGithubIssues,
} from '../functions/issues.ts';

/* GitHub の課題の問い合わせ。

   閉じたものを含めるかを `queryKey` に混ぜてあるのは、含める・含めないで**結果が違う**
   からである。混ぜないと、チップのインデックスのために全部を取った結果が、一覧の結果として
   使い回される。 */

/* 置く時間を長めにとってあるのは、相手がネットワークの向こうにいて、取り直すたびに
   `gh` の起動と API の呼び出しが要るからである。 */
export const githubIssuesQuery = (projectId: string, includeClosed: boolean) =>
  queryOptions({
    queryKey: ['github-issues', projectId, includeClosed] as const,
    queryFn: () => getGithubIssues({ data: { projectId, includeClosed } }),
    staleTime: 300_000,
  });

/* GitHub の課題 1 件の本文。**パネルを開いたときだけ求める** —— 一覧に混ぜると
   100 件ぶんの本文を運ぶことになり、一覧そのものが開かなくなる。

   本文は課題の他の欄より動かないので、置く時間は一覧より更に長くしてある。 */
export const githubIssueBodyQuery = (projectId: string, number: number) =>
  queryOptions({
    queryKey: ['github-issue-body', projectId, number] as const,
    queryFn: () => getGithubIssueBody({ data: { projectId, number } }),
    staleTime: 600_000,
  });

/* GitHub の課題 1 件のやり取り。**本文とも別に求める。** 何ページにもなることがあり、
   本文と同じ問い合わせにすると、本文だけを見たい人まで全ページぶんを待つことになる。

   置く時間は本文(10 分)より短く、`transcript` を読む問い合わせ(20〜60 秒)より長い 2 分に
   してある。やり取りは誰かが書き込むたびに伸びるので本文ほど動かないとは言えず、一方で
   取り直すたびに `gh` の起動と最大 5 ページぶんの API の呼び出しが要る。 */
export const githubIssueDiscussionQuery = (projectId: string, number: number) =>
  queryOptions({
    queryKey: ['github-issue-discussion', projectId, number] as const,
    queryFn: () => getGithubIssueDiscussion({ data: { projectId, number } }),
    staleTime: 120_000,
  });

/* 一覧に出ている課題に起きたこと。**一覧とも別に求める。**

   置く時間は一覧(5 分)と揃えてある。同じ 100 件を別の呼び出しで見ているので、片方だけが
   新しくなると、一覧に在る行の点が消えたり、消えた行の点が残ったりする。 */
export const githubIssueEventsQuery = (projectId: string) =>
  queryOptions({
    queryKey: ['github-issue-events', projectId] as const,
    queryFn: () => getGithubIssueEvents({ data: { projectId } }),
    staleTime: 300_000,
  });
