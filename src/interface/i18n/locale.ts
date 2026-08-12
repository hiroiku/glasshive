import {
  DEFAULT_LOCALE,
  isLocale,
  LOCALES,
  type Locale,
} from '~/application/use-cases/workspace/read-preferences.use-case.ts';

/* 画面に出せる言葉と、ブラウザーが名乗る言葉との間。

   出せる言葉の一覧は `preferences.json` を読む側が持っている。ここで数え直さない —
   数え直すと、言葉を足した日にどちらかが取り残される。 */

export { DEFAULT_LOCALE, isLocale, LOCALES, type Locale };

/* 選ぶための名前は、その言葉自身で書く。**英語の名前を並べない** —— 読めない言葉の一覧から
   自分の言葉を探すことになるのは、いま英語しか読めない画面に居る人である。 */
export const LOCALE_NAMES: Readonly<Record<Locale, string>> = {
  en: 'English',
  ja: '日本語',
  'zh-Hans': '简体中文',
  'zh-Hant': '繁體中文',
  ko: '한국어',
};

/* 繁体字で書く地域。**中国語だけは地域から書き分けを決めるしかない** —— `zh-TW` には
   書き分け(`Hant`)が書かれていないのに、簡体字で出すと読み手にとっては別の文字である。 */
const TRADITIONAL_REGIONS = new Set(['tw', 'hk', 'mo']);

/* BCP 47 のタグ 1 つを、出せる言葉に寄せる。寄せられなければ何も返さない。

   書き分け(`Hans` / `Hant`)が直に書いてあれば、そちらが地域より強い —— `zh-Hant-CN` と
   書いた人は繁体字を求めている。 */
function matchTag(tag: string): Locale | undefined {
  const parts = tag.toLowerCase().split('-');
  const language = parts[0];
  if (language === 'ja') return 'ja';
  if (language === 'ko') return 'ko';
  if (language === 'en') return 'en';
  if (language !== 'zh') return undefined;
  if (parts.includes('hant')) return 'zh-Hant';
  if (parts.includes('hans')) return 'zh-Hans';
  return parts.some((part) => TRADITIONAL_REGIONS.has(part)) ? 'zh-Hant' : 'zh-Hans';
}

/* ブラウザーが名乗る並びから、最初に出せるものを選ぶ。

   寄せられないタグは飛ばして次を見る。止めてしまうと、`['fr-FR', 'ja']` と名乗る人に
   英語を出すことになる。 */
export function negotiateLocale(tags: readonly string[]): Locale {
  for (const tag of tags) {
    const matched = matchTag(tag);
    if (matched !== undefined) return matched;
  }
  return DEFAULT_LOCALE;
}
