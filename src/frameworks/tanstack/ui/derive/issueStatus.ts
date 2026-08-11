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

export interface ClosedAt {
  readonly at: number;
  /** `closed_at` を読めず `updated_at` で代用した時刻か */
  readonly approx: boolean;
}

/* 閉じた時刻と、それが代用かどうか。閉じていない課題と、いつ閉じたか読めなかった課題は
   `null` になる。

   **`closed_at` が本物で、`updated_at` は代用である。** 閉じた後に誰かが書き込めば
   `updated_at` は先へ進むので、代用へ落ちた課題は実際より後ろの時刻を指す。それでも
   落とす先を持つのは、閉じたことが分かっているのに時刻だけ無い課題を、閉じていない課題と
   同じ扱いにしないためである。

   **代用かどうかを別々に判じない。** 時刻を採るところと代用かどうかを判じるところが
   離れると、片方が代用を観測した時刻の顔で描く。`closed_at` に値が在っても読めなければ
   代用である —— `null` かどうかだけを見ると、そこで判断が食い違う。 */
export function closedAt(issue: IssueSummaryJson): ClosedAt | null {
  if (!isClosedStatus(issue.status)) return null;
  const closed = Date.parse(issue.closed_at ?? '');
  if (Number.isFinite(closed)) return { at: closed, approx: false };
  const touched = Date.parse(issue.updated_at ?? '');
  return Number.isFinite(touched) ? { at: touched, approx: true } : null;
}

/** 閉じた時刻だけを見る呼び出し向け。代用かどうかまで要るなら `closedAt` を使う */
export function closedAtMs(issue: IssueSummaryJson): number | null {
  return closedAt(issue)?.at ?? null;
}
