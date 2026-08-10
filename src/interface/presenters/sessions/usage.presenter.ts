import type {
  ProjectUsage,
  UsageBucket,
} from '~/application/use-cases/sessions/observe-usage.use-case.ts';
import type { ObservationState } from '~/interface/presenters/sessions/tree.presenter.ts';

/* 消費のバケットを、外部 API が読む形へ写す。

   欄の名前を 1 文字にしてあるのは、バケットが数千並ぶからである。ここだけは文字数が
   そのまま転送量になるので、読みやすさより短さを採っている。 */

export interface UsageBucketJson {
  /** バケットの始まりの時刻。エポックのミリ秒 */
  t: number;
  model: string;
  i: number;
  o: number;
  /** 読み直した分。**消費には足さない** — 同じ会話を続けるほど膨らみ、大小が読めなくなる */
  cr: number;
  cw: number;
  /** このバケットに集計した応答の数 */
  n: number;
}

export interface UsageJson {
  state: ObservationState;
  reason: string | null;
  /** バケットが遡る先。空の一覧が「静かだった」のか「対象期間の外」なのかを、ここで見分ける */
  since: number;
  buckets: UsageBucketJson[];
}

const presentBucket = (bucket: UsageBucket): UsageBucketJson => ({
  t: bucket.atMs,
  model: bucket.model,
  i: bucket.input,
  o: bucket.output,
  cr: bucket.cacheRead,
  cw: bucket.cacheWrite,
  n: bucket.responses,
});

export function presentUsage(usage: ProjectUsage): UsageJson {
  const { buckets } = usage;
  if (buckets.kind !== 'observed') {
    return {
      state: buckets.kind,
      reason: buckets.kind === 'absent' ? buckets.reason : buckets.error.code,
      since: usage.sinceMs,
      buckets: [],
    };
  }
  return {
    state: 'observed',
    reason: null,
    since: usage.sinceMs,
    buckets: buckets.value.map(presentBucket),
  };
}
