import type { Locale } from '../locale.ts';
import type { Catalogue } from '../message.ts';
import { ja } from './ja.ts';
import { ko } from './ko.ts';
import { zhHans } from './zh-Hans.ts';
import { zhHant } from './zh-Hant.ts';

/* 言葉ごとのカタログ。

   **英語のカタログは無い。** 鍵が英語の原文そのものなので、英語のときは何も引かずに
   鍵をそのまま出す。持たないことで、英語の文を直したのにカタログの鍵だけ古いまま、
   という食い違いが起きようがない。 */

export const CATALOGUES: Readonly<Record<Locale, Catalogue>> = {
  en: {},
  ja,
  'zh-Hans': zhHans,
  'zh-Hant': zhHant,
  ko,
};
