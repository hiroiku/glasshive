import type { Locale } from './locale.ts';

/* 言葉の型と、差し込みの組み立て。

   カタログの鍵は英語の原文そのものである。**別に鍵を発明しない** —— 発明すると、
   画面のコードを読んだだけでは何が出るのか分からなくなり、鍵と原文がいつか食い違う。
   原文が鍵なら、英語のカタログは要らず、使われていない鍵は探し出せる。

   差し込みは 2 つの形だけを読む。`{name}` と、数に合わせて言い分ける
   `{name, plural, one {…} other {…}}` である。**数の言い分けは自分で数えない** ——
   `Intl.PluralRules` が言葉ごとの決まりを知っている。日本語・中国語・韓国語には
   言い分けが無く、英語には 2 つ在り、言葉によってはもっと在る。 */

export type Vars = Readonly<Record<string, string | number>>;

/** 英語の原文から、その言葉での文へ。持っていない原文は英語のまま出る */
export type Catalogue = Readonly<Record<string, string>>;

/** 数の言い分けで使う分類。`Intl.PluralRules` が返すものと同じ */
const PLURAL_FORMS = ['zero', 'one', 'two', 'few', 'many', 'other'] as const;

/* `{` から対応する `}` までを取る。中に `{}` が入れ子で入るので、深さを数える。

   閉じていなければ何も返さない。閉じていない書き方は書き手の誤りだが、ここで投げると
   1 つの綴り間違いで画面が消える。**出せるところまで出す。** */
function braced(text: string, open: number): { body: string; end: number } | undefined {
  let depth = 0;
  for (let i = open; i < text.length; i++) {
    if (text[i] === '{') depth += 1;
    else if (text[i] === '}') {
      depth -= 1;
      if (depth === 0) return { body: text.slice(open + 1, i), end: i + 1 };
    }
  }
  return undefined;
}

/** `one {…} other {…}` を分類ごとに割る */
function pluralBranches(source: string): Map<string, string> {
  const branches = new Map<string, string>();
  let i = 0;
  while (i < source.length) {
    const matched = /^\s*([a-z]+)\s*\{/.exec(source.slice(i));
    const form = matched?.[1];
    if (matched === null || form === undefined) break;
    const open = i + matched[0].length - 1;
    const body = braced(source, open);
    if (body === undefined) break;
    branches.set(form, body.body);
    i = body.end;
  }
  return branches;
}

const numberFormats = new Map<Locale, Intl.NumberFormat>();
const pluralRules = new Map<Locale, Intl.PluralRules>();

const numberFormatOf = (locale: Locale): Intl.NumberFormat => {
  const found = numberFormats.get(locale) ?? new Intl.NumberFormat(locale);
  numberFormats.set(locale, found);
  return found;
};

const pluralRulesOf = (locale: Locale): Intl.PluralRules => {
  const found = pluralRules.get(locale) ?? new Intl.PluralRules(locale);
  pluralRules.set(locale, found);
  return found;
};

/** 差し込む値を文字列にする。数だけはその言葉の桁の区切りに通す */
const printed = (value: string | number, locale: Locale): string =>
  typeof value === 'number' ? numberFormatOf(locale).format(value) : value;

/* 文を組み立てる。

   知らない名前の `{…}` は書いたまま残す。消すと、渡し忘れた差し込みが「そういう文だった」
   ように読めてしまう。 */
export function format(template: string, locale: Locale, vars: Vars = {}): string {
  let out = '';
  let i = 0;
  while (i < template.length) {
    if (template[i] !== '{') {
      out += template[i];
      i += 1;
      continue;
    }
    const field = braced(template, i);
    if (field === undefined) {
      out += template.slice(i);
      break;
    }
    const parts = field.body.split(',', 2);
    const name = (parts[0] ?? '').trim();
    const kind = (parts[1] ?? '').trim();
    const value = Object.hasOwn(vars, name) ? vars[name] : undefined;
    if (value === undefined) {
      out += template.slice(i, field.end);
      i = field.end;
      continue;
    }
    if (kind !== 'plural') {
      out += printed(value, locale);
      i = field.end;
      continue;
    }
    const count = typeof value === 'number' ? value : Number(value);
    // 分岐が始まるのは 2 つめの読点の後である。`plural` の綴りを探すと、同じ綴りを含む名前で狂う
    const branches = pluralBranches(
      field.body.slice(field.body.indexOf(',', field.body.indexOf(',') + 1) + 1),
    );
    const selected = pluralRulesOf(locale).select(count);
    const branch =
      branches.get(selected) ??
      branches.get('other') ??
      PLURAL_FORMS.map((form) => branches.get(form)).find((body) => body !== undefined) ??
      '';
    // `#` はこの分岐が語っている数そのもの。差し込みの名前を二度書かせない
    out += format(branch.replaceAll('#', printed(count, locale)), locale, vars);
    i = field.end;
  }
  return out;
}
