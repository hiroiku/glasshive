import hljs from 'highlight.js/lib/core';
import bash from 'highlight.js/lib/languages/bash';
import css from 'highlight.js/lib/languages/css';
import diff from 'highlight.js/lib/languages/diff';
import javascript from 'highlight.js/lib/languages/javascript';
import json from 'highlight.js/lib/languages/json';
import python from 'highlight.js/lib/languages/python';
import rust from 'highlight.js/lib/languages/rust';
import sql from 'highlight.js/lib/languages/sql';
import typescript from 'highlight.js/lib/languages/typescript';
import xml from 'highlight.js/lib/languages/xml';
import yaml from 'highlight.js/lib/languages/yaml';
import MarkdownIt from 'markdown-it';
import cjkFriendly from 'markdown-it-cjk-friendly';

/* 会話の本文を組む。**この読み込みは重い。**

   言語ごとの色付けと印付けの一式で、会話の窓でしか要らない。一覧と表しか観ない人へは
   届かないように、会話の窓の側から遅れて読み込む。

   言語を選んで登録しているのは、全部入りが数 MiB になるからである。 */

const LANGUAGES: readonly [string, Parameters<typeof hljs.registerLanguage>[1]][] = [
  ['bash', bash],
  ['sh', bash],
  ['css', css],
  ['diff', diff],
  ['javascript', javascript],
  ['js', javascript],
  ['json', json],
  ['python', python],
  ['rust', rust],
  ['sql', sql],
  ['typescript', typescript],
  ['ts', typescript],
  ['tsx', typescript],
  ['xml', xml],
  ['html', xml],
  ['yaml', yaml],
];

for (const [name, language] of LANGUAGES) hljs.registerLanguage(name, language);

/** 逃がすべき字を逃がす。色を付けられないときの最低限 */
const escapeHtml = (code: string): string =>
  code.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/* 符号に色を付ける。言語が分からなければ素のまま逃がす。

   **色付けに失敗しても本文は出す。** 色は読みやすさのためのもので、
   それが付かないことを理由に中身を隠す道理が無い。 */
export function highlight(code: string, language?: string): string {
  try {
    if (language !== undefined && hljs.getLanguage(language) !== undefined) {
      return hljs.highlight(code, { language }).value;
    }
  } catch {
    // 色付けの失敗は素で見せる
  }
  return escapeHtml(code);
}

/* 会話の本文の組み方。

   `html: false` — 正本の中の生の印(`<system-reminder>` など)は字として見せる。
   道具の内部のやりとりを画面の構造として解釈させない、という意味と、
   人の言葉として届いた印を実行させないという意味の両方がある。

   `breaks: true` — 会話文の 1 つの改行は改行として扱う。段落として畳むと、
   箇条書きのつもりで書かれた行が 1 行に繋がる。

   `cjk-friendly` — 日本語に隣り合った **強調** が、語の境目の決まりで壊れるのを直す。 */
const md = new MarkdownIt({
  html: false,
  linkify: true,
  breaks: true,
  highlight: (code, language) => {
    if (language !== '' && hljs.getLanguage(language) !== undefined) {
      return `<pre><code class="hljs">${highlight(code, language)}</code></pre>`;
    }
    return '';
  },
}).use(cjkFriendly);

/* 外への繋ぎは別の窓で開く。この窓は観測の途中なので、
   踏んだ拍子に観ていた盤面が置き換わると、そこまでの文脈が消える。 */
const defaultLinkOpen =
  md.renderer.rules.link_open ??
  ((tokens, index, options, _env, self) => self.renderToken(tokens, index, options));

md.renderer.rules.link_open = (tokens, index, options, env, self) => {
  tokens[index]?.attrSet('target', '_blank');
  tokens[index]?.attrSet('rel', 'noopener');
  return defaultLinkOpen(tokens, index, options, env, self);
};

export const mdToHtml = (text: string): string => md.render(text);
