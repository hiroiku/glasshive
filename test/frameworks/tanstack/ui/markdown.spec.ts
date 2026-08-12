import { describe, expect, it } from 'vitest';
import { mdToHtml } from '~/frameworks/tanstack/ui/markdown.ts';

/* 本文の組み方。

   確かめるのは 2 つ —— **通すタグと通さないタグの線が、どちらにもずれていないか**、そして
   その線が GitHub の本文にだけ引かれているか。通らなさすぎると GitHub の課題の本文が生の
   タグの並びになり、通りすぎると、人の言葉として届いたタグがこの画面の構造になる。 */

const github = (text: string) => mdToHtml(text, 'github');
const transcript = (text: string) => mdToHtml(text, 'transcript');

/** 通す綴りの全部。1 つでも落ちると、その書き方をした本文だけ生のタグとして並ぶ */
const INERT = ['b', 'i', 's', 'em', 'strong', 'del', 'ins', 'sub', 'sup', 'kbd'];

/* **通すのは、属性を持てず、中身を隠さず、外へ何も取りに行かない形だけである。**
   一覧を広げるときは、広げた綴りがこの 3 つを満たすかを見る。 */
const REFUSED = [
  'script',
  'style',
  'iframe',
  'object',
  'embed',
  'a',
  'img',
  'details',
  'summary',
  'form',
  'input',
  'template',
  'svg',
];

describe('GitHub の本文では、文字の見た目だけのタグを通す', () => {
  it.each(INERT)('<%s> をそのまま描く', (tag) => {
    expect(github(`x<${tag}>y</${tag}>z`)).toContain(`<${tag}>y</${tag}>`);
  });

  it('改行のタグも通す', () => {
    expect(github('1 行目<br>2 行目')).toContain('<br>');
  });

  it('書かれ方が違っても、同じ 1 つの綴りに直して出す', () => {
    for (const written of ['<br>', '<BR>', '<br/>', '<br />', '<br   />']) {
      expect(github(`x${written}y`), `${written} が書かれたまま残っている`).toContain('x<br>y');
    }
    expect(github('<SUB>x</SUB>')).toContain('<sub>x</sub>');
  });
});

describe('それ以外のタグは文字として見せる', () => {
  it.each(REFUSED)('<%s> は文字のまま', (tag) => {
    const html = github(`<${tag}>y</${tag}>`);

    expect(html, `<${tag}> を通すと、この画面に置けるものが増える`).not.toContain(`<${tag}>`);
    expect(html).toContain(`&lt;${tag}&gt;`);
  });

  /* 本文に書かれた素の URL は前から `linkify` がリンクにしている。ここで見たいのは、
     書かれたタグがタグとして出ないことなので、エスケープされた側を見る。 */
  it('外へ取りに行く書き方は、属性ごと文字のまま', () => {
    const image = github('<img src="https://avatars.githubusercontent.com/u/1">');

    expect(image).not.toContain('<img');
    expect(image).toContain('&lt;img src=');
    expect(github('<a href="https://example.com">x</a>')).toContain('&lt;a href=');
  });

  it('属性を持つと、通す一覧の綴りでも通さない', () => {
    expect(github('<sub onclick="run()">y</sub>'), '属性を通すと、一覧が意味を失う').not.toContain(
      '<sub onclick',
    );
    expect(github('<b class="x">y</b>')).not.toContain('<b class');
    expect(github('<b class="x">y</b>')).toContain('&lt;b class=');
  });

  it('名前が前から重なるだけの綴りは通さない', () => {
    expect(github('<subx>y</subx>')).toContain('&lt;subx&gt;');
    expect(github('<brx>')).toContain('&lt;brx&gt;');
  });
});

/* `transcript` の中のタグは、その機械が書いた文字そのものである。**画面の構造として
   解釈すると、書かれた文字が画面から消える。** */
describe('transcript のタグは、どれも文字のまま', () => {
  it.each([...INERT, 'br'])('<%s> を描かない', (tag) => {
    expect(transcript(`x<${tag}>y`)).toContain(`&lt;${tag}&gt;`);
  });

  it('ツールのやりとりのタグも文字のまま', () => {
    expect(transcript('<system-reminder>x</system-reminder>')).toContain('&lt;system-reminder&gt;');
  });
});

/* `code` と `pre` は書かれたとおりに出す場所である。そこで `<sub>` が subscript になると、
   タグそのものを見せている本文が、その 1 行だけ書かれたとおりでなくなる。 */
describe('書かれたとおりに出す場所では、通す綴りも文字のまま', () => {
  it('`code` の中は文字のまま', () => {
    expect(github('`<sub>x</sub>`')).toContain('<code>&lt;sub&gt;x&lt;/sub&gt;</code>');
  });

  it('囲った塊の中も文字のまま', () => {
    expect(github('```\n<sub>x</sub>\n```')).toContain('&lt;sub&gt;x&lt;/sub&gt;');
  });
});
