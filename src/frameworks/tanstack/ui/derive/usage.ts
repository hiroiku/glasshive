import type { UsageBucketJson } from '~/interface/presenters/sessions/usage.presenter.ts';
import { MAX_WINDOW_MS, QUOTA_WINDOW_MS } from './timeWindow.ts';

export { QUOTA_WINDOW_MS };

/* 消費のバケットから、画面に出す形を導く。純関数。

   「消費」は input + output + cache 書き込み。**cache 読みは足さない。**
   毎応答で文脈を丸ごと読み直すので桁が違い、足すと同じ会話を続けるほど数が膨らんで、
   消費の大小が読めなくなる。内訳としては別に見せる。 */

export const spendOf = (bucket: UsageBucketJson): number => bucket.i + bucket.o + bucket.cw;

/* 見え方は、一度に見る幅ひとつで決まる。**足(ローソク足 1 本の長さ)は選ばせない** ——
   幅を選べば、その幅を `MAX_BARS` 本以内で覆えるいちばん細かい足が決まる。2 つ選ばせると、
   効いているのがどちらなのかが読めなくなる。 */

/** 足の長さのラベル。1 時間より短い足は分で読む */
export const footLabel = (ms: number): string =>
  ms < 3_600_000 ? `${Math.round(ms / 60_000)}m` : `${Math.round(ms / 3_600_000)}h`;

/** 7 日を `MAX_BARS` 本以内で覆える、いちばん短い足 */
const LONGEST_FOOT_MS = 4 * 3_600_000;

/** 足の長さ。素材が 5 分のバケットなので 5m が最小 */
export const FEET: readonly { readonly key: number; readonly label: string }[] = [
  5 * 60_000,
  15 * 60_000,
  30 * 60_000,
  3_600_000,
  2 * 3_600_000,
  LONGEST_FOOT_MS,
].map((key) => ({ key, label: footLabel(key) }));

/** 一度に出す足の本数の上限 */
export const MAX_BARS = 72;

/** 素材が遡る範囲。見る幅の上限と同じで、これより古いバケットは持っていない */
export const WINDOW_MS = MAX_WINDOW_MS;

/** その範囲を `MAX_BARS` 本以内で覆える、いちばん短い足 */
export const footFor = (spanMs: number): number =>
  FEET.find((foot) => Math.ceil(Math.min(spanMs, WINDOW_MS) / foot.key) <= MAX_BARS)?.key ??
  LONGEST_FOOT_MS;

export interface Bin {
  total: number;
  input: number;
  output: number;
  cacheWrite: number;
  cacheRead: number;
}

/* 足の境目は現在からの相対ではなく、キリの良い時刻に置く。

   ローカルタイムの深夜を起点に足の倍数で区切り、**最新の 1 本だけが「直前の境目〜現在」の
   形成中の足**になる。相対に置くと、描き直すたびに全部の足が少しずつ横へ流れる。

   `spanMs` は見たい範囲で、足 × 本数がちょうどそれを覆う。素材は `WINDOW_MS` までしか
   遡れないので、それより広く頼まれても広げない。 */
export function gridOf(
  nowMs: number,
  footMs: number,
  spanMs: number = WINDOW_MS,
): { fromMs: number; bars: number } {
  const midnight = new Date(nowMs);
  midnight.setHours(0, 0, 0, 0);
  const anchor = midnight.getTime();
  const lastBoundary = anchor + Math.floor((nowMs - anchor) / footMs) * footMs;
  const bars = Math.max(2, Math.min(MAX_BARS, Math.ceil(Math.min(spanMs, WINDOW_MS) / footMs)));
  return { fromMs: lastBoundary - (bars - 1) * footMs, bars };
}

export function binUsage(
  buckets: readonly UsageBucketJson[],
  fromMs: number,
  footMs: number,
  bars: number,
): Bin[] {
  const bins: Bin[] = Array.from({ length: bars }, () => ({
    total: 0,
    input: 0,
    output: 0,
    cacheWrite: 0,
    cacheRead: 0,
  }));
  for (const bucket of buckets) {
    if (bucket.t < fromMs) continue;
    const index = Math.min(bars - 1, Math.max(0, Math.floor((bucket.t - fromMs) / footMs)));
    const bin = bins[index];
    if (bin === undefined) continue;
    bin.total += spendOf(bucket);
    bin.input += bucket.i;
    bin.output += bucket.o;
    bin.cacheWrite += bucket.cw;
    bin.cacheRead += bucket.cr;
  }
  return bins;
}

/** モデルごとの消費。多い順 */
export function byModel(buckets: readonly UsageBucketJson[]): [string, number][] {
  const totals = new Map<string, number>();
  for (const bucket of buckets) {
    totals.set(bucket.model, (totals.get(bucket.model) ?? 0) + spendOf(bucket));
  }
  return [...totals.entries()].sort((a, b) => b[1] - a[1]);
}

export interface QuotaWindow {
  readonly active: boolean;
  readonly tokens: number;
  /** 期間が明ける時刻 */
  readonly endsAtMs: number;
}

/* 定額枠の期間の連なりを近似する。

   最初の活動が期間を開き、期間が明けた後の最初の活動が次の期間を開く。
   **`transcript` から観測できる範囲の近似であって、課金側の正ではない。** */
export function quotaWindow(
  buckets: readonly UsageBucketJson[],
  nowMs: number,
  windowMs: number = QUOTA_WINDOW_MS,
): QuotaWindow {
  const times = [...new Set(buckets.map((bucket) => bucket.t))].sort((a, b) => a - b);
  let openedAt: number | null = null;
  let endsAt = 0;
  for (const at of times) {
    if (openedAt === null || at >= endsAt) {
      openedAt = at;
      endsAt = at + windowMs;
    }
  }
  if (openedAt === null || nowMs >= endsAt) return { active: false, tokens: 0, endsAtMs: endsAt };
  const start = openedAt;
  const tokens = buckets
    .filter((bucket) => bucket.t >= start)
    .reduce((total, bucket) => total + spendOf(bucket), 0);
  return { active: true, tokens, endsAtMs: endsAt };
}

/** 束ねた内訳。対象期間の内側だけ */
export function totalsOf(buckets: readonly UsageBucketJson[]): Bin {
  const sum: Bin = {
    total: 0,
    input: 0,
    output: 0,
    cacheWrite: 0,
    cacheRead: 0,
  };
  for (const bucket of buckets) {
    sum.total += spendOf(bucket);
    sum.input += bucket.i;
    sum.output += bucket.o;
    sum.cacheWrite += bucket.cw;
    sum.cacheRead += bucket.cr;
  }
  return sum;
}

/** 期間の長さのラベル */
export const rangeLabel = (ms: number): string =>
  ms >= 86_400_000
    ? `${(ms / 86_400_000).toFixed(ms % 86_400_000 ? 1 : 0)}d`
    : `${Math.round(ms / 3_600_000)}h`;
