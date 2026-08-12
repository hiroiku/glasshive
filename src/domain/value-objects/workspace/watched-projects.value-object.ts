import { isSafeAbsolutePath } from '~/app-kernel/path.ts';

/* 観ると決めたディレクトリ。

   これは観測ではなく、人が決めたものである。**記録は観測を作り出さない** —— ここにパスが
   在ることは、そこに何かが在ることの証しにはならない。読んでよいパスの集合もここから
   一切影響を受けない。設定ファイルが権限を与える経路を作らないためである。

   持つのは id ではなくパスである。**まだ Claude Code が一度も動いていないディレクトリを
   記録できなければならない** —— id は `~/.claude/projects` に在るものにしか付かないので、
   それでは「これから観る」と言えない。id はパスから決まるので、失うものは無い。

   並びがそのままタブの並びになる。 */

export interface WatchedProjects {
  readonly version: 2;
  /** 観ると決めたディレクトリの絶対パス。並びがそのまま表示の順 */
  readonly paths: readonly string[];
}

export const WATCHED_PROJECTS_VERSION = 2;

export const DEFAULT_WATCHED_PROJECTS: WatchedProjects = {
  version: WATCHED_PROJECTS_VERSION,
  paths: [],
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/* オブジェクトが自分で持っている欄だけを読む。

   **素のプロパティ参照はプロトタイプまで拾う。** `__proto__` や `constructor` を通して
   プロトタイプに欄が生えていると、欄の無い `preferences.json` が「欄の揃った設定」に見え、
   書いた覚えのない記録が読めてしまう。 */
const own = (record: Record<string, unknown>, key: string): unknown =>
  Object.hasOwn(record, key) ? record[key] : undefined;

/** 文字列だけの並びならそれ、そうでなければ無い。1 つでも文字列でなければ並びごと捨てる */
const asStrings = (value: unknown): readonly string[] | undefined => {
  if (!Array.isArray(value)) return undefined;
  return value.every((entry) => typeof entry === 'string') ? (value as string[]) : undefined;
};

const parsed = (text: string): Record<string, unknown> | undefined => {
  try {
    const value: unknown = JSON.parse(text);
    return isRecord(value) ? value : undefined;
  } catch {
    return undefined;
  }
};

/* `preferences.json` のテキストを、記録として読めるときだけ記録にする。

   **形を検証してから使う。** 欄の型が違う・文字列が壊れている、はどれも「読めるものが
   無い」ことであり、観測できなかったことではない。倒れても観測は 1 つも欠けない ——
   記録が「まだ何も観ていない」に見えるだけである。

   絶対パスでないものは落とす。この先は全部、絶対パスであることを前提にした突き合わせである。 */
export function parseWatchedProjects(text: string): WatchedProjects | undefined {
  const record = parsed(text);
  if (record === undefined) return undefined;
  if (own(record, 'version') !== WATCHED_PROJECTS_VERSION) return undefined;
  const paths = asStrings(own(record, 'watched'));
  if (paths === undefined) return undefined;
  return { version: WATCHED_PROJECTS_VERSION, paths: paths.filter(isSafeAbsolutePath) };
}

/* 1 つ前の形。留めていたのはプロジェクトの id で、パスは持っていない。

   **読めても、そのままでは記録にならない。** id からパスは決まらないので、観測の側で
   読み替えられたものだけが引き継がれる。引き継げなかったぶんは、そのプロジェクトが
   `~/.claude/projects` から消えているということである。 */
export function parsePinnedIds(text: string): readonly string[] | undefined {
  const record = parsed(text);
  if (record === undefined) return undefined;
  if (own(record, 'version') !== 1) return undefined;
  return asStrings(own(record, 'pinned'));
}
