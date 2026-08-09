import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/* 画面に出る言葉は英語で書く。

   注釈は日本語で書く決まりなので、素の探し方では文言と注釈が見分けられない。
   **注釈を落としてから見る。** 残るのは文字列と JSX の地の文、つまり我々が画面へ出す字だけになる。

   観測したもの(会話・課題の題名・枝の名前)は素性のまま出す。あれは我々の言葉ではないので、
   縛るのは我々が書いた字だけ。だから見るのは `src/` であって画面ではない。 */

const ROOT = path.resolve(import.meta.dirname, '..', '..');
const UI = path.join(ROOT, 'src', 'frameworks', 'tanstack');

const JAPANESE = /[ぁ-ゖァ-ヺ一-龥]/;

/* `/` は割り算にも正規表現にも見える。直前の意味のある字で決まる —
   値が閉じた後なら割り算、そうでなければ正規表現が始まる。
   **見分けを誤ると注釈の落とし方ごと崩れる**。`/['"]/` の `'` を文字列の始まりと読むと、
   そこから先の注釈が文字列の中身に化けて、丸ごと素通りする。 */
const BEFORE_REGEX = /[([{,;:!&|?+\-*%<>~^=]$/;
const KEYWORD_BEFORE_REGEX =
  /\b(return|typeof|instanceof|in|of|case|do|else|yield|await|new|delete|void)$/;

function stripComments(source: string): string {
  let out = '';
  let i = 0;
  let mode: 'code' | 'line' | 'block' | "'" | '"' | '`' | '/' = 'code';

  const regexFollows = () => {
    const before = out.replace(/\s+$/, '');
    if (before === '') return true;
    return BEFORE_REGEX.test(before) || KEYWORD_BEFORE_REGEX.test(before);
  };

  while (i < source.length) {
    const c = source[i];
    const n = source[i + 1];

    if (mode === 'code') {
      if (c === '/' && n === '/') {
        mode = 'line';
        out += '  ';
        i += 2;
        continue;
      }
      if (c === '/' && n === '*') {
        mode = 'block';
        out += '  ';
        i += 2;
        continue;
      }
      if (c === '/' && regexFollows()) mode = '/';
      else if (c === "'" || c === '"' || c === '`') mode = c;
      out += c;
      i++;
      continue;
    }

    if (mode === 'line') {
      if (c === '\n') mode = 'code';
      out += c === '\n' ? c : ' ';
      i++;
      continue;
    }

    if (mode === 'block') {
      if (c === '*' && n === '/') {
        mode = 'code';
        out += '  ';
        i += 2;
        continue;
      }
      out += c === '\n' ? '\n' : ' ';
      i++;
      continue;
    }

    // 文字列と正規表現の中。閉じるまでそのまま運ぶ
    if (c === '\\') {
      out += c + (n ?? '');
      i += 2;
      continue;
    }
    if (c === mode || (mode === '/' && c === '\n')) mode = 'code';
    out += c;
    i++;
  }
  return out;
}

function sources(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return sources(full);
    if (!/\.tsx?$/.test(entry.name) || entry.name.endsWith('.gen.ts')) return [];
    return [full];
  });
}

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
      expect(wording(file), '注釈は日本語のままでよい。見ているのは画面に出る字だけ').toEqual([]);
    },
  );

  /* 見張りそのものが効いているか。落とし方が壊れて素通りするようになっても、
     どのファイルも緑のままなので気づけない */
  it('注釈は見逃し、文言は捉える', () => {
    const code = [
      'const re = /[\'"]/;',
      '/* 日本語の注釈。これは見逃す */',
      '// これも見逃す',
      'const label = "これは捉える";',
    ].join('\n');

    const left = stripComments(code)
      .split('\n')
      .filter((line) => JAPANESE.test(line));

    expect(left).toEqual(['const label = "これは捉える";']);
  });
});
