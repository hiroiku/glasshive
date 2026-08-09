/* 観る人がタブに並べるものの選び。

   これは観測ではなく、人の申し出である。**選びは観測を作り出さない** — ここに id が
   在ることは、その巣が在ることの証しにはならない。読んでよい場所の集合もここから
   一切影響を受けない。設定ファイルが権利を与える道を作らないためである。

   版も移行も復旧も持たない。持った瞬間に「失ってはいけないもの」に変わり、
   壊れても観測は止まらないという前提が崩れる。壊れたときに起きるのは選び直しだけで、
   一覧も窓もそのまま動く。 */

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

/* 記録が自分で持っている欄だけを読む。

   **素の索きは土台から拾う。** `__proto__` や `constructor` を通して土台に欄が生えていると、
   欄の無い覚え書きが「欄の揃った覚え書き」に見え、書いた覚えのない選びが読めてしまう。 */
const own = (record: Record<string, unknown>, key: string): unknown =>
  Object.hasOwn(record, key) ? record[key] : undefined;

/** 字だけの並びならそれ、そうでなければ無い。1 つでも字でなければ並びごと捨てる */
const asIds = (value: unknown): readonly string[] | undefined => {
  if (!Array.isArray(value)) return undefined;
  return value.every((entry) => typeof entry === 'string') ? (value as string[]) : undefined;
};

/* 覚え書きの字を、選びとして読めるときだけ選びにする。

   **形を確かめてから使う。** 版が違う・欄の型が違う・字が壊れている、はどれも
   「読めるものが無い」ことであり、読めなかったことではない。移行も復旧も持たないので、
   ここで捨てて既定へ倒す。倒れても観測は 1 つも欠けない — 留めた印が
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

/* 選びを、覚え書きの字にする。読み解きと同じ場所に置いてあるのは、
   置いた形と読める形が離れないようにするためである。 */
export function serializeTabSelection(selection: TabSelection): string {
  return `${JSON.stringify(
    {
      version: TAB_SELECTION_VERSION,
      mode: selection.mode,
      pinned: [...selection.pinned],
      hidden: [...selection.hidden],
    },
    null,
    2,
  )}\n`;
}
