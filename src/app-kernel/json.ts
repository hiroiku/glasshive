/* 型の分からない値を、安全に覗くためのヘルパー。

   外から来た JSON は、こちらの型を守る義理が無い。欄が無い・型が違う・行そのものが
   壊れている、はどれも起こって当たり前である。だから覗く側が毎回検証する。

   **壊れた行は記録ではない。** 投げて観測を止めるのではなく、その行だけを飛ばす。
   1 行の壊れで観測をまるごと失うことのほうが、はるかに大きな嘘になる。

   どの bounded context にも属さない。ここに在るのは JSON の形の話だけで、業務の言葉は 1 つも無い。 */

export type JsonRecord = Record<string, unknown>;

const isRecord = (value: unknown): value is JsonRecord =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/* そのオブジェクト自身が持つ欄か。プロトタイプから生えてきた名前を欄として読まない。

   素のプロパティ参照だと `__proto__` や `constructor` が値を返し、欄が 1 つも無い記録が
   「欄の揃った記録」として読めてしまう。 */
const own = (source: JsonRecord, key: string): unknown =>
  Object.hasOwn(source, key) ? source[key] : undefined;

/** 欄が文字列ならその文字列、そうでなければ無い */
export function asString(source: unknown, key: string): string | undefined {
  if (!isRecord(source)) return undefined;
  const value = own(source, key);
  return typeof value === 'string' ? value : undefined;
}

/** 欄が入れ子の記録ならそれ、そうでなければ無い */
export function asRecord(source: unknown, key: string): JsonRecord | undefined {
  if (!isRecord(source)) return undefined;
  const value = own(source, key);
  return isRecord(value) ? value : undefined;
}

/** 欄が並びならそれ、そうでなければ無い */
export function asArray(source: unknown, key: string): readonly unknown[] | undefined {
  if (!isRecord(source)) return undefined;
  const value = own(source, key);
  return Array.isArray(value) ? value : undefined;
}

/** 欄がある(値が undefined でない)か。値が null でも「ある」と見る */
export function hasKey(source: unknown, key: string): boolean {
  return isRecord(source) && own(source, key) !== undefined;
}

/** 数値として読めるならその数値、そうでなければ 0 */
export function asInt(source: unknown, key: string): number {
  if (!isRecord(source)) return 0;
  const value = own(source, key);
  return typeof value === 'number' && Number.isFinite(value) ? Math.trunc(value) : 0;
}

/* 行ごとにパースして、記録として読めたものだけを流す。

   数値や文字列だけの行、`null` の行、壊れた行は、どれも記録ではないので流さない。
   ここで落としておくことで、以降の導出は「記録である」ことだけを前提にできる。 */
export function* parseJsonlLines(text: string): Generator<JsonRecord> {
  for (const line of text.split('\n')) {
    if (line === '') continue;
    let parsed: unknown;
    try {
      parsed = JSON.parse(line);
    } catch {
      continue;
    }
    if (isRecord(parsed)) yield parsed;
  }
}

/** 先頭の 1 行だけをパースする */
export function parseFirstJsonLine(text: string): JsonRecord | undefined {
  const end = text.indexOf('\n');
  const first = end >= 0 ? text.slice(0, end) : text;
  if (first === '') return undefined;
  try {
    const parsed: unknown = JSON.parse(first);
    return isRecord(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
}
