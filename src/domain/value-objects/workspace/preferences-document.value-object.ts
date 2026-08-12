import { isLocale, type Locale } from './locale.value-object.ts';
import {
  parsePinnedIds,
  parseWatchedProjects,
  WATCHED_PROJECTS_VERSION,
  type WatchedProjects,
} from './watched-projects.value-object.ts';

/* `preferences.json` そのもの。人が決めたものが 2 つ入っている —— 観ると決めたディレクトリと、
   画面の言葉。

   **片方が読めないことを、もう片方に及ぼさない。** 1 つのパースで両方を読むと、`watched` の
   1 要素が壊れているだけで選んだ言葉まで捨てることになり、その逆も起きる。読み方を分けて
   あるのはそのためで、同じテキストを二度読む代わりに、壊れ方が伝染しない。

   1 つ前の形(留めた id の並び)だけは読む。**そこに書いてあるのは、その人が観ると決めた
   ものそのものだからである** —— 捨てると、更新した日に一覧が黙って空になる。読み替えは
   観測の側でしかできないので、ここでは id を渡すところまでにする。 */

export interface PreferencesDocument {
  /** 読める記録。読めなければ無い */
  readonly watched: WatchedProjects | undefined;
  /** 1 つ前の形で留めてあった id。今の形で読めたなら見ない */
  readonly pinnedIds: readonly string[] | undefined;
  /** 選ばれた言葉。まだ選んでいなければ無い —— 選んでいないことは、英語を選んだことではない */
  readonly locale: Locale | undefined;
}

/* オブジェクトが自分で持っている欄だけを読む。プロトタイプに生えた欄は、書いた覚えのない
   記録が読めてしまう経路になる。 */
const own = (value: unknown, key: string): unknown =>
  typeof value === 'object' && value !== null && !Array.isArray(value) && Object.hasOwn(value, key)
    ? (value as Record<string, unknown>)[key]
    : undefined;

/* 選ばれた言葉だけを読む。**記録が読めるかどうかを見に行かない** —— 見に行くと、
   記録の壊れ方が言葉の選択を巻き添えにする。 */
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
  return {
    watched: parseWatchedProjects(text),
    pinnedIds: parsePinnedIds(text),
    locale: parseLocale(text),
  };
}

/* 決めたものを `preferences.json` のテキストにする。読める形と置く形が離れないよう、
   パースと同じ場所に置いてある。

   まだ選んでいない言葉は `null` として置く。欄ごと落とすと、次に読んだ人には
   「この `preferences.json` には言葉の欄が無い」と「まだ選んでいない」が同じ顔で見える。 */
export function serializePreferencesDocument(document: {
  readonly watched: WatchedProjects;
  readonly locale: Locale | null;
}): string {
  return `${JSON.stringify(
    {
      version: WATCHED_PROJECTS_VERSION,
      watched: [...document.watched.paths],
      locale: document.locale,
    },
    null,
    2,
  )}\n`;
}
