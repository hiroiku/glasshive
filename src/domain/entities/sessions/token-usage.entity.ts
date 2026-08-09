/* 使ったトークン。

   正本の assistant 行に付く usage を拾い、5 分ごとの桶に畳む。
   畳んだものだけを持つのは、生の行を持つと正本と同じ大きさになるからである。 */

/** 桶の幅。これより細かくしても画面で読めず、粗くすると山が均されて見えなくなる */
export const BUCKET_MS = 5 * 60_000;

/** 畳む前の 1 応答ぶん */
export interface UsageRecord {
  /* 同じ応答を二度数えないための鍵。流し書きでは、同じ応答の行が累積した usage を
     付けて何度も現れる。後に現れた行ほど累積が進んでいるので、最後の 1 つを採る。 */
  readonly key: string;
  readonly atMs: number;
  readonly model: string;
  readonly input: number;
  readonly output: number;
  readonly cacheRead: number;
  readonly cacheWrite: number;
}

/** 5 分 × モデルの桶 */
export interface UsageBucket {
  readonly atMs: number;
  readonly model: string;
  readonly input: number;
  readonly output: number;
  readonly cacheRead: number;
  readonly cacheWrite: number;
  /** 畳んだ応答の数 */
  readonly responses: number;
}
