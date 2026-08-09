import type {
  ProjectUsage,
  UsageBucket,
} from '~/application/use-cases/sessions/observe-usage.use-case.ts';
import type { ObservationState } from '~/interface/presenters/sessions/tree.presenter.ts';

/* 消費の桶を、外の道が読む形へ写す。

   欄の名前を 1 字にしてあるのは、桶が数千並ぶからである。ここだけは字数が
   そのまま転送量になるので、読みやすさより短さを採っている。 */

export interface UsageBucketJson {
  /** 桶の始まりの時刻。エポックのミリ秒 */
  t: number;
  model: string;
  i: number;
  o: number;
  /** 読み直した分。**消費には足さない** — 同じ会話を続けるほど膨らみ、大小が読めなくなる */
  cr: number;
  cw: number;
  /** 畳んだ応答の数 */
  n: number;
}

export interface UsageJson {
  state: ObservationState;
  reason: string | null;
  /** 桶が遡る先。空の一覧が「静かだった」のか「窓の外」なのかを、ここで見分ける */
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
