import { mdiHomeOutline, mdiRhombus, mdiSourceBranch } from '@mdi/js';
import { useMemo } from 'react';
import type { ProjectJson } from '~/interface/presenters/sessions/tree.presenter.ts';
import type { AgentRef, IssueRef } from '../../derive/tokens.ts';
import { useTokenIndex } from '../../hooks/useTokenIndex.ts';
import { hoverTok } from '../../hoverTok.ts';
import { mdToHtml } from '../../markdown.ts';
import { useNav } from '../../nav/NavContext.tsx';
import { iconHtml } from '../primitives/Icon.tsx';

/* 本文を組み、その中の既知の語を札に変える。

   押されたことは委譲で拾う。**組み上がった字の中に React は置けない** ので、
   札は字として組み、押しどころは外側の 1 つで受ける。

   `mdToHtml` の出す字は `html: false` で組まれているので、元の本文に在った印は
   既に逃がされている。ここで足すのは自分で組んだ札だけである。 */

const WORD = /[A-Za-z0-9][\w./-]*/g;

/** 札が指しているものを、押されたときに引き当てるための印 */
const tokenOf = (element: HTMLElement): string | null =>
  element.dataset.issue ??
  element.dataset.git ??
  (element.dataset.file === undefined ? null : decodeURIComponent(element.dataset.file));

/* 逃がし済みの字の、**字の部分だけ**を走査して札に置き換える。

   印の中(`<...>`)には触らない。触ると、属性の中の語が札に化けて印が壊れる。 */
function linkifyTokens(
  html: string,
  issues: Map<string, IssueRef>,
  agents: Map<string, AgentRef>,
  gits: Map<string, 'branch' | 'worktree'>,
): string {
  if (issues.size === 0 && agents.size === 0 && gits.size === 0) return html;

  const chipOf = (word: string): string | null => {
    const issue = issues.get(word);
    if (issue !== undefined) {
      return `<a class="ichip${issue.closed ? ' closed' : ''}" role="button" tabindex="0" data-issue="${issue.id}">${iconHtml(mdiRhombus, 9)}${issue.id}</a>`;
    }
    const agent = agents.get(word);
    if (agent !== undefined) {
      return `<a class="agchip" role="button" tabindex="0" data-file="${encodeURIComponent(agent.file)}"><i class="adot ${agent.state}"></i>${word}</a>`;
    }
    const git = gits.get(word);
    if (git !== undefined) {
      return `<a class="refchip" role="button" tabindex="0" data-git="${word}">${iconHtml(git === 'worktree' ? mdiHomeOutline : mdiSourceBranch, 10)}${word}</a>`;
    }
    return null;
  };

  return html
    .split(/(<[^>]+>)/g)
    .map((segment) => {
      if (segment.startsWith('<')) return segment;
      return segment.replace(WORD, (word) => {
        const hit = chipOf(word);
        if (hit !== null) return hit;
        if (word.includes('/')) {
          const pieces = word.split(/(\/)/g);
          if (pieces.some((piece, i) => i % 2 === 0 && chipOf(piece) !== null)) {
            return pieces
              .map((piece, i) => (i % 2 === 0 ? (chipOf(piece) ?? piece) : piece))
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
  const index = useTokenIndex(project);
  const html = useMemo(
    () => linkifyTokens(mdToHtml(text), index.issues, index.agents, index.gits),
    [text, index.issues, index.agents, index.gits],
  );

  const closestChip = (target: EventTarget | null): HTMLElement | null =>
    (target as HTMLElement | null)?.closest('a.ichip, a.agchip, a.refchip') ?? null;

  const open = (chip: HTMLElement) => {
    if (chip.dataset.issue !== undefined) nav.openIssue(chip.dataset.issue);
    else if (chip.dataset.file !== undefined) nav.openConv(decodeURIComponent(chip.dataset.file));
    else if (chip.dataset.git !== undefined) nav.gotoGit(chip.dataset.git);
  };

  const light = (target: EventTarget | null, on: boolean) => {
    const chip = closestChip(target);
    const token = chip === null ? null : tokenOf(chip);
    if (token !== null) hoverTok(token, on);
  };

  return (
    /* 押しどころは組み上がった字の中の札で、そのひとつずつが役と焦点の順を持っている。
       受けるのは外側の 1 つ — 札は字として組まれていて、React を差し込めない。 */
    // biome-ignore lint/a11y/noStaticElementInteractions: 中の札が受け口を持ち、ここは束ねるだけ
    <div
      className={className}
      onClick={(event) => {
        const chip = closestChip(event.target);
        if (chip === null) return;
        // 会話の泡そのものの押しどころを乗っ取らない
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
      // 組んだ字は逃がし済み。ここで足したのは自分で組んだ札だけである
      // biome-ignore lint/security/noDangerouslySetInnerHtml: markdown-it を html:false で組んでおり、正本の生の印は字として逃がされている
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
