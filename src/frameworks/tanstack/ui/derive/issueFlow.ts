import type { IssueSummaryJson } from '~/interface/presenters/issues/issues.presenter.ts';

/* 課題の増減の移り変わり。

   **台帳には遷移の履歴が無い。** 在るのは作られた時刻と、最後に触られた時刻だけである。
   だから閉じたものの `updated_at` を閉じた時刻と見なして数える — 閉じた後にも触れば
   ずれるが、閉じた課題が再び触られることは稀で、目で追う形としては足りる。

   近似であることを画面の側で言い落とさないこと。 */

/** 足の本数 */
export const FLOW_BARS = 60;

/** 見る窓 */
export const FLOW_SPAN_MS = 30 * 86_400_000;

export interface FlowSeries {
  /** 足ごとの、その時点で開いていた数 */
  readonly open: readonly number[];
  /** 足ごとの、そこまでに閉じた数の累計 */
  readonly closed: readonly number[];
}

const sortedTimes = (values: readonly (string | null)[]): number[] =>
  values
    .map((value) => Date.parse(value ?? ''))
    .filter(Number.isFinite)
    .sort((a, b) => a - b);

export function flowSeries(issues: readonly IssueSummaryJson[], nowMs: number): FlowSeries {
  const from = nowMs - FLOW_SPAN_MS;
  const step = FLOW_SPAN_MS / FLOW_BARS;
  const created = sortedTimes(issues.map((issue) => issue.created_at));
  const closedAt = sortedTimes(
    issues.filter((issue) => issue.status === 'closed').map((issue) => issue.updated_at),
  );

  const open: number[] = [];
  const closed: number[] = [];
  let madeSoFar = 0;
  let closedSoFar = 0;
  for (let bar = 0; bar < FLOW_BARS; bar += 1) {
    const at = from + (bar + 1) * step;
    while (madeSoFar < created.length && (created[madeSoFar] ?? 0) <= at) madeSoFar += 1;
    while (closedSoFar < closedAt.length && (closedAt[closedSoFar] ?? 0) <= at) closedSoFar += 1;
    open.push(madeSoFar - closedSoFar);
    closed.push(closedSoFar);
  }
  return { open, closed };
}
