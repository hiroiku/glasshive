import fs from 'node:fs';
import path from 'node:path';

/* 画面のコードから、我々が書いたテキストだけを取り出す。

   コメントは日本語で書く決まりなので、素の探し方では文言とコメントが見分けられない。
   落としてから見る。落とし方をここ 1 箇所に置いてあるのは、日本語が混ざっていないかを
   見る側と、訳の鍵を数える側が、同じ落とし方を見るためである。 */

/* `/` は割り算にも正規表現にも見える。直前の意味のある文字で決まる —
   値が閉じた後なら割り算、そうでなければ正規表現が始まる。
   **見分けを誤るとコメントの落とし方ごと崩れる**。`/['"]/` の `'` を文字列の始まりと読むと、
   そこから先のコメントが文字列の中身に化けて、丸ごと素通りする。 */
const BEFORE_REGEX = /[([{,;:!&|?+\-*%<>~^=]$/;
const KEYWORD_BEFORE_REGEX =
  /\b(return|typeof|instanceof|in|of|case|do|else|yield|await|new|delete|void)$/;

export function stripComments(source: string): string {
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

export function sources(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return sources(full);
    if (!/\.tsx?$/.test(entry.name) || entry.name.endsWith('.gen.ts')) return [];
    return [full];
  });
}

/* 訳の鍵を取り出す。鍵は `t()` に渡した英語の原文そのものである。

   受けるのはリテラルだけである。**組み立てた文字列を鍵にできない** —— 鍵の一覧を
   取り出せなくなり、訳が揃っているかを誰も数えられなくなる。リテラル以外が渡っていないかは
   `translationCalls` が数える。 */
const LITERAL = /(?<![\w$])t\(\s*(?:'((?:[^'\\\n]|\\.)*)'|"((?:[^"\\\n]|\\.)*)"|`([^`\\$\n]*)`)/g;

/** `t(` の呼び出しそのもの。第 1 引数がリテラルかどうかは見ない */
const ANY_CALL = /(?<![\w$])t\(\s*/g;

const unescaped = (text: string): string =>
  text.replace(/\\(.)/g, (_all, char: string) =>
    char === 'n' ? '\n' : char === 't' ? '\t' : char,
  );

export function translationKeys(source: string): string[] {
  const stripped = stripComments(source);
  return [...stripped.matchAll(LITERAL)].map((match) =>
    unescaped(match[1] ?? match[2] ?? match[3] ?? ''),
  );
}

/** `t(` を何回書いたか。取り出せた鍵の数と食い違えば、リテラルでない鍵が在る */
export function translationCalls(source: string): number {
  return [...stripComments(source).matchAll(ANY_CALL)].length;
}
