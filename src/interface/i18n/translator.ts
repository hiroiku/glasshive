import { CATALOGUES } from './catalogues/index.ts';
import { DEFAULT_LOCALE, type Locale } from './locale.ts';
import { type Catalogue, format, type Vars } from './message.ts';

/* 英語の原文を、選ばれた言葉の文にする呼び出し。

   **持っていない原文は英語のまま出す。** 訳が抜けている画面は読みにくいが、鍵の綴りが
   剥き出しになった画面は読めない。抜けを見つけるのはレビューではなく契約テストの仕事で、
   ここは実行時にできる限りのものを出す。 */

export interface Translator {
  (source: string, vars?: Vars): string;
  /** いま出している言葉。`<html lang>` と `Intl` に渡すためにここから読む */
  readonly locale: Locale;
}

export function createTranslator(locale: Locale): Translator {
  const catalogue: Catalogue = CATALOGUES[locale] ?? {};
  const translate = (source: string, vars?: Vars): string =>
    format(catalogue[source] ?? source, locale, vars);
  return Object.assign(translate, { locale });
}

/** 訳を持たない、英語をそのまま出す呼び出し。テストと、まだ言葉が決まっていない場面で使う */
export const englishTranslator: Translator = createTranslator(DEFAULT_LOCALE);
