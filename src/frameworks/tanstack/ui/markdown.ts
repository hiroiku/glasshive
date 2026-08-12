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

   言語ごとのシンタックスハイライトと Markdown の一式で、会話のパネルでしか要らない。
   一覧と表しか見ないユーザーへ届かないよう、会話のパネルの側から遅れて読み込む。

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

/** エスケープすべき文字をエスケープする。色を付けられないときの最低限 */
const escapeHtml = (code: string): string =>
  code.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/* コードに色を付ける。言語が分からなければ、色を付けずにエスケープだけして返す。

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

   `html: false` — `transcript` の中の生のタグ(`<system-reminder>` など)は文字列として
   見せる。ツールの内部のやりとりを画面の構造として解釈させない、という意味と、
   人の言葉として届いたタグを実行させないという意味の両方がある。GitHub の本文だけは
   下の `inert_html` が一部を通すので、出どころを呼ぶ側から受け取る。

   `breaks: true` — 会話文の 1 つの改行は改行として扱う。段落としてまとめると、
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

/* `html: false` の下でも、GitHub の本文でだけ、文字の見た目のタグを通す。

   GitHub の課題の本文とコメントは GitHub 自身がこれらを描くので、通さないと `<sub>` が
   そのまま文字として並ぶ。**通すのは、下の綴りにぴたりと合う形だけである** —— 属性が
   1 つでも付いていれば合わないので、`href` も `src` も `on...` も画面へ出られない。
   `<details>` を挙げていないのは、既定で中身を畳むタグだからである —— 観測したものを
   画面から隠すタグを、glasshive が置く理由が無い。

   合った形は、綴りを揃えて 1 通りに直して出す。`<BR />` も `<br>` として出るので、
   書かれ方の違いが後ろの処理へ流れていかない。 */
const INERT_HTML = /^<(?:(br)\s*\/?|(\/?)(b|i|s|em|strong|del|ins|sub|sup|kbd))>/i;

md.inline.ruler.before('html_inline', 'inert_html', (state, silent) => {
  if (state.env?.github !== true || state.src.charCodeAt(state.pos) !== 0x3c) return false;
  const found = INERT_HTML.exec(state.src.slice(state.pos, state.posMax));
  if (found === null) return false;
  if (!silent) {
    const [, lineBreak, closing, name] = found;
    state.push('html_inline', '', 0).content =
      lineBreak === undefined ? `<${closing}${name?.toLowerCase()}>` : '<br>';
  }
  state.pos += found[0].length;
  return true;
});

/* 外部リンクは別のタブで開く。いま見ているタブは観測の途中なので、
   踏んだ拍子にいま見ている画面が置き換わると、そこまでの文脈が消える。 */
const defaultLinkOpen =
  md.renderer.rules.link_open ??
  ((tokens, index, options, _env, self) => self.renderToken(tokens, index, options));

md.renderer.rules.link_open = (tokens, index, options, env, self) => {
  tokens[index]?.attrSet('target', '_blank');
  tokens[index]?.attrSet('rel', 'noopener');
  return defaultLinkOpen(tokens, index, options, env, self);
};

/* 本文の出どころ。**既定を置かない** —— 置くと、新しく足された呼び出しが、どちらの
   決まりで描かれるのかを言わないまま通ってしまう。 */
export type MarkdownSource = 'transcript' | 'github';

export const mdToHtml = (text: string, source: MarkdownSource): string =>
  md.render(text, { github: source === 'github' });
