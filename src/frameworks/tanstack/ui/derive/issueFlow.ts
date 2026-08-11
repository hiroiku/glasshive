import type { IssueSummaryJson } from '~/interface/presenters/issues/issues.presenter.ts';
import { closedAtMs, isClosedStatus } from './issueStatus.ts';

/* 課題の増減の移り変わり。

   **取ってきた課題に遷移の履歴は無い。** 在るのは作られた時刻と閉じた時刻だけなので、
   ここが描けるのは「その時点で開いていた数」と「そこまでに閉じた数」の 2 本である。
   開いた課題がいつ堰き止められたか、いつ担当が付いたかは、この素材からは出せない。

   閉じた時刻の読み方は `closedAtMs` に任せる —— `issueGantt.ts` と同じ規則で読む。
   **閉じたものは `closed` だけではない。** `not_planned` も閉じている。片方だけを数えると、
   やらないと決めた課題が開いたまま積み上がる。 */

/** バーの本数 */
export const FLOW_BARS = 60;

/** 集計する期間 */
export const FLOW_SPAN_MS = 30 * 86_400_000;

export interface FlowSeries {
  /** バーごとの、その時点で開いていた数 */
  readonly open: readonly number[];
  /** バーごとの、そこまでに閉じた数の累計 */
  readonly closed: readonly number[];
}

const sorted = (values: readonly (number | null)[]): number[] =>
  values
    .filter((value): value is number => value !== null && Number.isFinite(value))
    .sort((a, b) => a - b);

const parsed = (iso: string | null): number | null => {
  const atMs = Date.parse(iso ?? '');
  return Number.isFinite(atMs) ? atMs : null;
};

export function flowSeries(issues: readonly IssueSummaryJson[], nowMs: number): FlowSeries {
  const from = nowMs - FLOW_SPAN_MS;
  const step = FLOW_SPAN_MS / FLOW_BARS;
  const created = sorted(issues.map((issue) => parsed(issue.created_at)));
  const closedAt = sorted(
    issues.filter((issue) => isClosedStatus(issue.status)).map((issue) => closedAtMs(issue)),
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
