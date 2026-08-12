/* ユーザーがタブに並べるものの選択。

   これは観測ではなく、人が決めたものである。**選択は観測を作り出さない** — ここに id が
   在ることは、そのプロジェクトが在ることの証しにはならない。読んでよいパスの集合も
   ここから一切影響を受けない。設定ファイルが権限を与える経路を作らないためである。

   バージョンも移行も復旧も持たない。持った瞬間に「失ってはいけないもの」に変わり、
   壊れても観測は止まらないという前提が崩れる。壊れたときに起きるのは選び直しだけで、
   一覧もパネルもそのまま動く。 */

export interface TabSelection {
  readonly version: 1;
  /** 一覧を絞るか。`pinned` は「留めたものだけを並べる」の意 */
  readonly mode: 'all' | 'pinned';
  /** 並びの順がそのまま表示の順 */
  readonly pinned: readonly string[];
  /** 一覧から伏せるもの。タブ行の話ではない */
  readonly hidden: readonly string[];
}

export const TAB_SELECTION_VERSION = 1;

export const DEFAULT_TAB_SELECTION: TabSelection = {
  version: TAB_SELECTION_VERSION,
  mode: 'all',
  pinned: [],
  hidden: [],
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/* オブジェクトが自分で持っている欄だけを読む。

   **素のプロパティ参照はプロトタイプまで拾う。** `__proto__` や `constructor` を通して
   プロトタイプに欄が生えていると、欄の無い `preferences.json` が「欄の揃った設定」に見え、
   書いた覚えのない選択が読めてしまう。 */
const own = (record: Record<string, unknown>, key: string): unknown =>
  Object.hasOwn(record, key) ? record[key] : undefined;

/** 文字列だけの並びならそれ、そうでなければ無い。1 つでも文字列でなければ並びごと捨てる */
const asIds = (value: unknown): readonly string[] | undefined => {
  if (!Array.isArray(value)) return undefined;
  return value.every((entry) => typeof entry === 'string') ? (value as string[]) : undefined;
};

/* `preferences.json` のテキストを、選択として読めるときだけ選択にする。

   **形を検証してから使う。** バージョンが違う・欄の型が違う・文字列が壊れている、はどれも
   「読めるものが無い」ことであり、観測できなかったことではない。移行も復旧も持たないので、
   ここで捨てて既定へ倒す。倒れても観測は 1 つも欠けない — ピン留めが
   「留めていない」に見えるだけである。 */
export function parseTabSelection(text: string): TabSelection | undefined {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return undefined;
  }
  if (!isRecord(parsed)) return undefined;
  if (own(parsed, 'version') !== TAB_SELECTION_VERSION) return undefined;
  const mode = own(parsed, 'mode');
  if (mode !== 'all' && mode !== 'pinned') return undefined;
  const pinned = asIds(own(parsed, 'pinned'));
  const hidden = asIds(own(parsed, 'hidden'));
  if (pinned === undefined || hidden === undefined) return undefined;
  return { version: TAB_SELECTION_VERSION, mode, pinned, hidden };
}
