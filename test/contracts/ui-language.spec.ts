import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { sources, stripComments } from './ui-source.ts';

/* 画面に出る言葉は英語で書く。

   コメントは日本語で書く決まりなので、素の探し方では文言とコメントが見分けられない。
   **コメントを落としてから見る。** 残るのは文字列リテラルと JSX の地の文、つまり我々が画面へ出す
   テキストだけになる。

   観測したもの(会話・課題の題名・ブランチの名前)は素性のまま出す。あれは我々の言葉ではないので、
   縛るのは我々が書いたテキストだけ。だから見るのは `src/` であって画面ではない。 */

const ROOT = path.resolve(import.meta.dirname, '..', '..');
const UI = path.join(ROOT, 'src', 'frameworks', 'tanstack');

const JAPANESE = /[ぁ-ゖァ-ヺ一-龥]/;

function wording(file: string): string[] {
  return stripComments(fs.readFileSync(file, 'utf8'))
    .split('\n')
    .flatMap((line, index) =>
      JAPANESE.test(line) ? [`${index + 1}: ${line.trim().slice(0, 60)}`] : [],
    );
}

describe('画面の言葉', () => {
  it.each(sources(UI).map((file) => [path.relative(ROOT, file), file]))(
    '%s に日本語の文言が無い',
    (_name, file) => {
      expect(
        wording(file),
        'コメントは日本語のままでよい。見ているのは画面に出るテキストだけ',
      ).toEqual([]);
    },
  );

  /* このテストそのものが効いているか。コメントの落とし方が壊れて素通りするようになっても、
     どのファイルも緑のままなので気づけない */
  it('コメントは見逃し、文言は捉える', () => {
    const code = [
      'const re = /[\'"]/;',
      '/* 日本語のコメント。これは見逃す */',
      '// これも見逃す',
      'const label = "これは捉える";',
    ].join('\n');

    const left = stripComments(code)
      .split('\n')
      .filter((line) => JAPANESE.test(line));

    expect(left).toEqual(['const label = "これは捉える";']);
  });
});
