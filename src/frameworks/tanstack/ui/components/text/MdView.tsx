import { mdiHomeOutline, mdiRhombus, mdiSourceBranch, mdiSourceCommit } from '@mdi/js';
import { useMemo } from 'react';
import type { ProjectJson } from '~/interface/presenters/sessions/tree.presenter.ts';
import { commitToken, type TokenDict } from '../../derive/tokens.ts';
import { useTokenIndex } from '../../hooks/useTokenIndex.ts';
import { hoverTok } from '../../hoverTok.ts';
import { mdToHtml } from '../../markdown.ts';
import { useNav } from '../../nav/NavContext.tsx';
import { iconHtml } from '../primitives/Icon.tsx';

/* Markdown をレンダリングし、その中の既知の語をチップに変える。

   クリックはイベント委譲で拾う。**組み上がった HTML の文字列の中に React は置けない**
   ので、チップも文字列として組み、ハンドラは外側の 1 つで受ける。

   `mdToHtml` の出す HTML は `html: false` で組まれているので、元の本文に在ったタグは
   既にエスケープされている。ここで足すのは自分で組んだチップだけである。 */

const WORD = /[A-Za-z0-9][\w./-]*/g;

/** 組んだ HTML に混ぜる前にエスケープする。ここへ来るのは観測の値で、タグの文字を含みうる */
const esc = (raw: string): string =>
  raw.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** チップにホバーしたときに、画面の側の同じものをハイライトするための語 */
const tokenOf = (element: HTMLElement): string | null => {
  const { issue, git, rev, file } = element.dataset;
  if (issue !== undefined) return issue;
  if (git !== undefined) return git;
  if (rev !== undefined) return commitToken(rev);
  return file === undefined ? null : decodeURIComponent(file);
};

/* エスケープ済みの HTML の、**テキストの部分だけ**を走査してチップに置き換える。

   タグの中(`<...>`)には触らない。触ると、属性の中の語がチップに化けてタグが壊れる。 */
function linkifyTokens(html: string, dict: TokenDict): string {
  if (dict.empty) return html;

  /* `code` と `pre` の中と外で、同じものを別の見た目で出す。持たせる `data-*` は同じなので、
     クリック先も、ホバーでハイライトされる相手も変わらない。

     中では書かれた表記のままにする。`code` と `pre` は書かれたとおりに出す場所で、
     読み手はそこの文字を見に来ている。略記を正式な id に伸ばせば書かれたとおりでなくなるし、
     背景色と余白を持ったチップを等幅の一続きに置けば、枠を突き破って隣の行に重なる。
     その中の見た目(`tokref`)はボックスを持たない。

     **アイコンは `code` と `pre` の中にも置く。** 色と下線だけでは「押せる」しか言えず、押す前に
     それが課題なのかブランチなのかコミットなのかが読めない。アイコンはボックスを持たないので、
     `code` と `pre` の中に置いても行の高さを動かさない。 */
  const chipOf = (word: string, verbatim: boolean): string | null => {
    const hit = dict.lookup(word);
    if (hit === null) return null;
    const open = (className: string, mark: string, title: string) =>
      `<span class="${className}" role="button" tabindex="0" title="${esc(title)}" ${mark}>`;

    switch (hit.kind) {
      case 'issue': {
        const tone = hit.closed ? ' closed' : '';
        const mark = `data-issue="${esc(hit.id)}"`;
        const icon = iconHtml(mdiRhombus, 9);
        if (verbatim)
          return `${open(`tokref issue${tone}`, mark, hit.id)}${icon}${esc(word)}</span>`;
        return `${open(`ichip${tone}`, mark, hit.id)}${icon}${esc(hit.id)}</span>`;
      }
      case 'agent': {
        const mark = `data-file="${encodeURIComponent(hit.file)}"`;
        // エージェントのアイコンは状態の点。何をしているかまで一目で読める
        const icon = `<i class="adot ${hit.state}"></i>`;
        if (verbatim)
          return `${open(`tokref agent ${hit.state}`, mark, hit.file)}${icon}${esc(word)}</span>`;
        return `${open('agchip', mark, hit.file)}${icon}${esc(word)}</span>`;
      }
      case 'ref': {
        const mark = `data-git="${esc(hit.name)}"`;
        const icon = iconHtml(hit.ref === 'worktree' ? mdiHomeOutline : mdiSourceBranch, 10);
        if (verbatim) return `${open('tokref ref', mark, hit.name)}${icon}${esc(word)}</span>`;
        return `${open('refchip', mark, hit.name)}${icon}${esc(word)}</span>`;
      }
      case 'commit': {
        const mark = `data-rev="${esc(hit.rev)}" data-label="${esc(word)}"`;
        const title = hit.subject === '' ? hit.rev : `${hit.rev} — ${hit.subject}`;
        const icon = iconHtml(mdiSourceCommit, 10);
        if (verbatim) return `${open('tokref commit', mark, title)}${icon}${esc(word)}</span>`;
        return `${open('refchip commit', mark, title)}${icon}${esc(word)}</span>`;
      }
    }
  };

  /* `code` と `pre` の中に居るかを数える。中でも突き合わせは止めず、見た目だけを変える。 */
  let verbatim = 0;

  return html
    .split(/(<[^>]+>)/g)
    .map((segment) => {
      if (segment.startsWith('<')) {
        if (/^<(code|pre)[\s>]/.test(segment)) verbatim += 1;
        else if (/^<\/(code|pre)>/.test(segment) && verbatim > 0) verbatim -= 1;
        return segment;
      }
      const inCode = verbatim > 0;
      return segment.replace(WORD, (word) => {
        const hit = chipOf(word, inCode);
        if (hit !== null) return hit;
        if (word.includes('/')) {
          const pieces = word.split(/(\/)/g);
          if (pieces.some((piece, i) => i % 2 === 0 && chipOf(piece, inCode) !== null)) {
            return pieces
              .map((piece, i) => (i % 2 === 0 ? (chipOf(piece, inCode) ?? piece) : piece))
              .join('');
          }
        }
        return word;
      });
    })
    .join('');
}

export function MdView({
  text,
  project,
  className = 'md',
}: {
  text: string;
  project: ProjectJson | undefined;
  className?: string;
}) {
  const nav = useNav();
  const dict = useTokenIndex(project);
  const html = useMemo(() => linkifyTokens(mdToHtml(text), dict), [text, dict]);

  const closestChip = (target: EventTarget | null): HTMLElement | null =>
    (target as HTMLElement | null)?.closest('.ichip, .agchip, .refchip, .tokref') ?? null;

  const open = (chip: HTMLElement) => {
    const { issue, file, rev, label, git } = chip.dataset;
    if (issue !== undefined) nav.openIssue(issue);
    else if (file !== undefined) nav.openConv(decodeURIComponent(file));
    else if (rev !== undefined) nav.openRef(rev, label ?? rev);
    else if (git !== undefined) nav.gotoBranch(git);
  };

  const light = (target: EventTarget | null, on: boolean) => {
    const chip = closestChip(target);
    const token = chip === null ? null : tokenOf(chip);
    if (token !== null) hoverTok(token, on);
  };

  return (
    /* クリックの対象は組み上がった HTML の中のチップで、そのひとつずつが `role` と
       `tabIndex` を持っている。ハンドラを受けるのは外側の 1 つ — チップは文字列として
       組まれていて、React を差し込めない。 */
    // biome-ignore lint/a11y/noStaticElementInteractions: 中のチップが `role` を持ち、ここは束ねるだけ
    <div
      className={className}
      onClick={(event) => {
        const chip = closestChip(event.target);
        if (chip === null) return;
        // 会話の吹き出しそのもののクリックを乗っ取らない
        event.stopPropagation();
        open(chip);
      }}
      onKeyDown={(event) => {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        const chip = closestChip(event.target);
        if (chip === null) return;
        event.preventDefault();
        event.stopPropagation();
        open(chip);
      }}
      onMouseOver={(event) => light(event.target, true)}
      onMouseOut={(event) => light(event.target, false)}
      onFocus={(event) => light(event.target, true)}
      onBlur={(event) => light(event.target, false)}
      // 組んだ HTML はエスケープ済み。ここで足したのは自分で組んだチップだけである
      // biome-ignore lint/security/noDangerouslySetInnerHtml: markdown-it を html:false で使っており、transcript の生のタグは文字列としてエスケープされている
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
