import { asInt, asRecord, asString, parseJsonlLines } from '~/app-kernel/json.ts';
import { type Observation, observed } from '~/app-kernel/observation.ts';
import {
  BUCKET_MS,
  type UsageBucket,
  type UsageRecord,
} from '~/domain/entities/sessions/token-usage.entity.ts';
import {
  isSyntheticModel,
  UNKNOWN_MODEL,
} from '~/domain/value-objects/sessions/model-id.value-object.ts';

/* 使ったトークンを、`transcript` の文字から導く。

   ここはファイルに触らない。`transcript` のどこを読むか、読んだものを覚えておくかは
   外の役目で、ここは渡された文字だけを見る。 */

/** 集計している途中のバケット。数を足していくので、ここだけ書き換えられる形にする */
type BucketDraft = { -readonly [K in keyof UsageBucket]: UsageBucket[K] };

/** 5 分 × モデルで一意になるキー */
const bucketKeyOf = (atMs: number, model: string): string => `${atMs}|${model}`;

const draftOf = (atMs: number, model: string): BucketDraft => ({
  atMs,
  model,
  input: 0,
  output: 0,
  cacheRead: 0,
  cacheWrite: 0,
  responses: 0,
});

/** バケットは時刻の昇順で渡す。読み手が並べ替えずに山の形を見られる */
const byAtMs = (drafts: Iterable<BucketDraft>): readonly UsageBucket[] =>
  [...drafts].sort((a, b) => a.atMs - b.atMs);

/* `transcript` の文字から、応答 1 つぶんの消費を拾う。

   採るのは assistant の行で usage を持つものだけ。ストリーミングでは同じ応答の行が累積した
   usage を付けて何度も現れるので、キーごとに後の 1 つで上書きして二重に数えないようにする。 */
export function extractUsageRecords(text: string): readonly UsageRecord[] {
  const byKey = new Map<string, UsageRecord>();
  for (const record of parseJsonlLines(text)) {
    if (asString(record, 'type') !== 'assistant') continue;
    const message = asRecord(record, 'message');
    const usage = asRecord(message, 'usage');
    if (!usage) continue;
    // 時刻の読めない行はバケットに入れる先が無い
    const atMs = Date.parse(asString(record, 'timestamp') ?? '');
    if (!Number.isFinite(atMs)) continue;
    const model = asString(message, 'model') ?? UNKNOWN_MODEL;
    // 合成メッセージは実体の無い行なので、消費として数えない
    if (isSyntheticModel(model)) continue;
    // requestId が無い `transcript` もある。message.id、それも無ければ時刻で応答を区別する
    const key = asString(record, 'requestId') || asString(message, 'id') || String(atMs);
    byKey.set(key, {
      key,
      atMs,
      model,
      input: asInt(usage, 'input_tokens'),
      output: asInt(usage, 'output_tokens'),
      cacheRead: asInt(usage, 'cache_read_input_tokens'),
      cacheWrite: asInt(usage, 'cache_creation_input_tokens'),
    });
  }
  return [...byKey.values()];
}

/* 応答を 5 分ごと・モデルごとのバケットへ集計する。

   バケットの時刻は幅の始まりへ丸める。同じ 5 分でもモデルが違えば別のバケットにするのは、
   どのモデルがどれだけ使ったかを後から分けて見られるようにするためである。 */
export function bucketByFiveMinutes(records: readonly UsageRecord[]): readonly UsageBucket[] {
  const buckets = new Map<string, BucketDraft>();
  for (const record of records) {
    const atMs = Math.floor(record.atMs / BUCKET_MS) * BUCKET_MS;
    const key = bucketKeyOf(atMs, record.model);
    const bucket = buckets.get(key) ?? draftOf(atMs, record.model);
    bucket.input += record.input;
    bucket.output += record.output;
    bucket.cacheRead += record.cacheRead;
    bucket.cacheWrite += record.cacheWrite;
    bucket.responses += 1;
    buckets.set(key, bucket);
  }
  return byAtMs(buckets.values());
}

/* `transcript` 1 つぶんの総消費。

   cacheRead を数えないのは、これが前に書いた分を読み直しただけで、新しく使った量では
   ないからである。足すと同じ会話を続けるほど数が膨らみ、消費の大小が読めなくなる。 */
export function totalTokens(buckets: readonly UsageBucket[]): number {
  let total = 0;
  for (const bucket of buckets) total += bucket.input + bucket.output + bucket.cacheWrite;
  return total;
}

/* sinceMs 以降だけの消費。対象期間に入るバケットだけを足す。

   バケットの時刻は幅の始まりへ丸められているので、期間の境目にまたがるバケットは
   始まりが内側にあるときだけ入る。5 分の粗さは、一覧に出す概数には十分である。 */
export function tokensSince(buckets: readonly UsageBucket[], sinceMs: number): number {
  let total = 0;
  for (const bucket of buckets) {
    if (bucket.atMs < sinceMs) continue;
    total += bucket.input + bucket.output + bucket.cacheWrite;
  }
  return total;
}

/* `transcript` ごとの数を、プロジェクト 1 つぶんの数にまとめる。

   **1 つでも観測できなかった `transcript` があれば、まとめた数も観測できなかったことにする。**
   観測できた分だけを足して出すと、実際より小さい数が「これが全部だ」という顔で並ぶ。
   トークンの列で少なく見えることは、そのプロジェクトが静かだったという意味に読まれてしまう。

   `absent` の `transcript`(対象期間の外・消えた)は 0 として足す。これは分からないのではなく、
   その期間に消費が無いと分かっている。 */
export function combineTokens(parts: readonly Observation<number>[]): Observation<number> {
  let total = 0;
  for (const part of parts) {
    if (part.kind === 'unobservable') return part;
    if (part.kind === 'observed') total += part.value;
  }
  return observed(total);
}

/* 複数の `transcript` のバケットを合流し、sinceMs 以降だけを時刻の昇順で返す。

   セッションとサブエージェントは別々の `transcript` に書かれるので、プロジェクト 1 つぶんの
   消費を見るにはここで足し合わせる。期間より前のバケットを落とすのは、
   見せる期間の外を数に混ぜないためである。 */
export function mergeBuckets(
  sets: readonly (readonly UsageBucket[])[],
  sinceMs: number,
): readonly UsageBucket[] {
  const merged = new Map<string, BucketDraft>();
  for (const buckets of sets) {
    for (const bucket of buckets) {
      if (bucket.atMs < sinceMs) continue;
      const key = bucketKeyOf(bucket.atMs, bucket.model);
      const target = merged.get(key) ?? draftOf(bucket.atMs, bucket.model);
      target.input += bucket.input;
      target.output += bucket.output;
      target.cacheRead += bucket.cacheRead;
      target.cacheWrite += bucket.cacheWrite;
      target.responses += bucket.responses;
      merged.set(key, target);
    }
  }
  return byAtMs(merged.values());
}
