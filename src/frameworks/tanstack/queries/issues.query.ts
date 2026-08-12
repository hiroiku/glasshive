import { queryOptions, experimental_streamedQuery as streamedQuery } from '@tanstack/react-query';
import type {
  GithubIssueEventLogJson,
  GithubIssueEventsChunkJson,
  IssuesChunkJson,
  IssuesJson,
} from '~/interface/presenters/issues/issues.presenter.ts';
import {
  getGithubIssueBody,
  getGithubIssueDiscussion,
  getGithubIssueEventsStream,
  getGithubIssuesStream,
} from '../functions/issues.ts';

/* GitHub の課題の問い合わせ。

   閉じたものを含めるかを `queryKey` に混ぜてあるのは、含める・含めないで**結果が違う**
   からである。混ぜないと、チップのインデックスのために全部を取った結果が、一覧の結果として
   使い回される。 */

/* 最初のチャンクが着くまでの姿。行はまだ 1 つも無く、どこの課題かも決まっていない。

   `state` を `absent` にしてあるのは、まだ尋ねてもいないからである。**`unobservable` に
   しない** —— 尋ねる前から「読めなかった」と言うことになる。 */
const EMPTY: IssuesJson = {
  state: 'absent',
  reason: 'no-source',
  issues: [],
  counts: {},
  truncated: false,
  repository: null,
  other_repositories: 0,
};

/* チャンクを 1 枚の一覧へ畳む。

   **足すのであって、置き換えない。** ページは前のページを含まないので、行も件数も積み上げる。
   最初の 1 枚だけは丸ごと置き換わる —— そこに `state` と尋ね先が入っている。 */
export function reduceIssues(current: IssuesJson, chunk: IssuesChunkJson): IssuesJson {
  if (chunk.kind === 'issues') return chunk.issues;
  if (chunk.kind === 'complete') return { ...current, truncated: chunk.truncated };
  const counts = { ...current.counts };
  for (const [status, count] of Object.entries(chunk.counts)) {
    counts[status] = (counts[status] ?? 0) + count;
  }
  return { ...current, issues: [...current.issues, ...chunk.issues], counts };
}

/* 置く時間を長めにとってあるのは、相手がネットワークの向こうにいて、取り直すたびに
   `gh` の起動と API の呼び出しが要るからである。

   届き方はストリームである。**ページ 1 の 100 件に、ページ 5 を待つ理由は無い。** 最初の
   チャンクが着いた時点で `success` になり、最後まで届くまで `fetchStatus` は `fetching` の
   ままなので、「もう描いてよい」と「まだ途中である」を同じ 1 つの問い合わせから言える。 */
export const githubIssuesQuery = (projectId: string, includeClosed: boolean) =>
  queryOptions({
    queryKey: ['github-issues', projectId, includeClosed] as const,
    queryFn: streamedQuery({
      streamFn: () => getGithubIssuesStream({ data: { projectId, includeClosed } }),
      reducer: reduceIssues,
      initialValue: EMPTY,
      /* 取り直しの間、前の一覧を出したままにする。**`reset` にしない** —— 変更通知のたびに
         画面が空になり、読み終えるまで課題が 1 件も無いところへ戻ってしまう。 */
      refetchMode: 'replace',
    }),
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
/* 最初のチャンクが着くまでの姿。行はまだ 1 つも無く、全部を辿ってもいない */
const NO_EVENTS: GithubIssueEventLogJson = {
  state: 'absent',
  reason: 'no-source',
  issues: [],
  complete: false,
};

/* チャンクを 1 枚の記録へ畳む。**足すのであって、置き換えない。**

   `complete` を動かすのは最後の 1 つだけである。読んでいる途中で `true` にすると、まだ
   届いていない行が「読みに行って、そこに記録が無かった行」になる。 */
export function reduceIssueEvents(
  current: GithubIssueEventLogJson,
  chunk: GithubIssueEventsChunkJson,
): GithubIssueEventLogJson {
  if (chunk.kind === 'log') return chunk.log;
  if (chunk.kind === 'complete') return { ...current, complete: chunk.complete };
  return { ...current, issues: [...current.issues, ...chunk.issues] };
}

export const githubIssueEventsQuery = (projectId: string) =>
  queryOptions({
    queryKey: ['github-issue-events', projectId] as const,
    queryFn: streamedQuery({
      streamFn: () => getGithubIssueEventsStream({ data: { projectId } }),
      reducer: reduceIssueEvents,
      initialValue: NO_EVENTS,
      // 取り直しの間、前の記録を出したままにする。捨てると、点が消えてから埋まり直す
      refetchMode: 'replace',
    }),
    staleTime: 300_000,
  });
