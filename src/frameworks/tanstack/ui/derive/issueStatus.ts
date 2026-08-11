import type { IssueSummaryJson } from '~/interface/presenters/issues/issues.presenter.ts';

/* 課題を「済んだもの」として扱う状態。

   **`buildLedger` が落とすものと同じ集合である。** 1 回で全部を取ってきて、一覧だけを
   ここで絞る。`gh` への往復がこの画面でいちばん高く、閉じたものを含めるかどうかで
   取ってくる中身は変わらないからである。

   ここで見ているのは表示に出すかどうかだけで、`counts` は絞る前から数える。数えてから
   落とすのは、閉じた課題が `counts` から消えると「閉じたものは 1 つも無い」に見えるためである。 */

const CLOSED_STATUSES: ReadonlySet<string> = new Set(['closed', 'not_planned']);

export const isClosedStatus = (status: string): boolean => CLOSED_STATUSES.has(status);

/** 閉じたものを含めない一覧。含めるなら渡されたまま返す */
export const withoutClosed = (issues: readonly IssueSummaryJson[]): readonly IssueSummaryJson[] =>
  issues.filter((issue) => !isClosedStatus(issue.status));
