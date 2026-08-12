import { isLocale, type Locale } from './locale.value-object.ts';
import {
  parseTabSelection,
  TAB_SELECTION_VERSION,
  type TabSelection,
} from './tab-selection.value-object.ts';

/* `preferences.json` そのもの。人が選んだものが 2 つ入っている —— タブの選択と、画面の言葉。

   **片方が読めないことを、もう片方に及ぼさない。** 1 つのパースで両方を読むと、`pinned` の
   1 要素が壊れているだけで選んだ言葉まで捨てることになり、その逆も起きる。読み方を分けて
   あるのはそのためで、同じテキストを二度読む代わりに、壊れ方が伝染しない。

   移行も復旧も持たない。持った瞬間に「失ってはいけないもの」に変わり、壊れても観測は
   止まらないという前提が崩れる。壊れたときに起きるのは選び直しだけである。 */

export interface PreferencesDocument {
  /** 読めるタブの選択。読めなければ無い */
  readonly selection: TabSelection | undefined;
  /** 選ばれた言葉。まだ選んでいなければ無い —— 選んでいないことは、英語を選んだことではない */
  readonly locale: Locale | undefined;
}

/* オブジェクトが自分で持っている欄だけを読む。プロトタイプに生えた欄は、書いた覚えのない
   選択が読めてしまう経路になる。 */
const own = (value: unknown, key: string): unknown =>
  typeof value === 'object' && value !== null && !Array.isArray(value) && Object.hasOwn(value, key)
    ? (value as Record<string, unknown>)[key]
    : undefined;

/* 選ばれた言葉だけを読む。**タブの選択が読めるかどうかを見に行かない** —— 見に行くと、
   ピン留めの壊れ方が言葉の選択を巻き添えにする。 */
function parseLocale(text: string): Locale | undefined {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return undefined;
  }
  const locale = own(parsed, 'locale');
  return isLocale(locale) ? locale : undefined;
}

export function parsePreferencesDocument(text: string): PreferencesDocument {
  return { selection: parseTabSelection(text), locale: parseLocale(text) };
}

/* 選んだものを `preferences.json` のテキストにする。読める形と置く形が離れないよう、
   パースと同じ場所に置いてある。

   まだ選んでいない言葉は `null` として置く。欄ごと落とすと、次に読んだ人には
   「この `preferences.json` には言葉の欄が無い」と「まだ選んでいない」が同じ顔で見える。 */
export function serializePreferencesDocument(document: {
  readonly selection: TabSelection;
  readonly locale: Locale | null;
}): string {
  return `${JSON.stringify(
    {
      version: TAB_SELECTION_VERSION,
      mode: document.selection.mode,
      pinned: [...document.selection.pinned],
      hidden: [...document.selection.hidden],
      locale: document.locale,
    },
    null,
    2,
  )}\n`;
}
