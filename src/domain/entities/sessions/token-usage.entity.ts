/* 使ったトークン。

   `transcript` の assistant 行に付く usage を拾い、5 分ごとのバケットに集計する。
   集計したものだけを持つのは、生の行を持つと `transcript` と同じ大きさになるからである。 */

/** バケットの幅。これより細かくしても画面で読めず、粗くすると山が均されて見えなくなる */
export const BUCKET_MS = 5 * 60_000;

/** 集計する前の 1 応答ぶん */
export interface UsageRecord {
  /* 同じ応答を二度数えないためのキー。ストリーミングでは、同じ応答の行が累積した usage を
     付けて何度も現れる。後に現れた行ほど累積が進んでいるので、最後の 1 つを採る。 */
  readonly key: string;
  readonly atMs: number;
  readonly model: string;
  readonly input: number;
  readonly output: number;
  readonly cacheRead: number;
  readonly cacheWrite: number;
}

/** 5 分 × モデルのバケット */
export interface UsageBucket {
  readonly atMs: number;
  readonly model: string;
  readonly input: number;
  readonly output: number;
  readonly cacheRead: number;
  readonly cacheWrite: number;
  /** 集計した応答の数 */
  readonly responses: number;
}
