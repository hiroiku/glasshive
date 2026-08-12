import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { CATALOGUES } from '~/interface/i18n/catalogues/index.ts';
import { LOCALES } from '~/interface/i18n/locale.ts';
import { sources, translationCalls, translationKeys } from './ui-source.ts';

/* 訳が揃っているかを数える。

   鍵は `t()` に渡した英語の原文そのものである。だから英語のカタログは無く、英語の鍵の集合は
   画面のコードから取り出せる。**取り出せることが、この契約の土台である** —— 鍵を組み立てて
   渡せるようにすると、揃っているかを誰も数えられなくなる。

   見るのは 3 つ。鍵がリテラルであること、どのカタログも英語と同じ鍵を持つこと、そして
   使われていない鍵が残っていないことである。 */

const ROOT = path.resolve(import.meta.dirname, '..', '..');
const UI = path.join(ROOT, 'src', 'frameworks', 'tanstack');

const files = sources(UI);

/** 画面のコードが `t()` に渡している英語の原文すべて */
const englishKeys = new Set(
  files.flatMap((file) => translationKeys(fs.readFileSync(file, 'utf8'))),
);

describe('訳の鍵は、画面のコードから取り出せる', () => {
  it.each(files.map((file) => [path.relative(ROOT, file), file]))(
    '%s の `t()` は、リテラルだけを受けている',
    (_name, file) => {
      const text = fs.readFileSync(file, 'utf8');

      expect(
        translationCalls(text) - translationKeys(text).length,
        '組み立てた文字列を鍵にすると、訳が揃っているかを数えられなくなる',
      ).toBe(0);
    },
  );

  it('鍵が 1 つも取り出せないことは無い', () => {
    expect(englishKeys.size, '取り出しが壊れると、以下の検査が全部素通りする').toBeGreaterThan(100);
  });
});

/* 訳の抜けは実行時には英語のまま出るので、画面を見ても気づけない。ここで数えるしかない。 */
describe('どのカタログも、英語と同じ鍵を持つ', () => {
  const translated = LOCALES.filter((locale) => locale !== 'en');

  it.each(translated)('%s に、訳の抜けが無い', (locale) => {
    const missing = [...englishKeys].filter((key) => !Object.hasOwn(CATALOGUES[locale], key));

    expect(missing, '抜けている鍵は英語のまま出るので、画面を見ても気づけない').toEqual([]);
  });

  /* 画面の英語を直したのに鍵だけ古いまま、という食い違いはこれでしか見つからない。 */
  it.each(translated)('%s に、使われていない鍵が無い', (locale) => {
    const unused = Object.keys(CATALOGUES[locale]).filter((key) => !englishKeys.has(key));

    expect(unused, '使われていない鍵は、直し忘れた原文の跡である').toEqual([]);
  });

  it('英語は、鍵をそのまま出すので何も持たない', () => {
    expect(
      Object.keys(CATALOGUES.en),
      '英語のカタログを持つと、原文を直したときに二か所を直すことになる',
    ).toEqual([]);
  });
});

/* 訳文の中の差し込みは、原文と同じ名前でなければ値が出ない。**渡していない名前は書いたまま
   残る**ので、綴りを間違えた訳は `{n}` のまま画面に出る。 */
describe('訳文の差し込みは、原文と同じ名前を使う', () => {
  const placeholders = (text: string): string[] =>
    [...text.matchAll(/\{\s*([A-Za-z_][A-Za-z0-9_]*)\s*[,}]/g)].map((match) => match[1] ?? '');

  it.each(LOCALES.filter((locale) => locale !== 'en'))(
    '%s の差し込みが、原文と揃っている',
    (locale) => {
      const wrong = Object.entries(CATALOGUES[locale]).flatMap(([key, value]) => {
        const want = [...new Set(placeholders(key))].sort();
        const got = [...new Set(placeholders(value))].sort();
        return want.join(',') === got.join(',') ? [] : [`${key}\n  want ${want}\n  got  ${got}`];
      });

      expect(wrong, '名前が違う差し込みは、値が出ずに `{n}` のまま画面へ出る').toEqual([]);
    },
  );
});
