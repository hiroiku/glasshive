import type { ProjectJson } from '~/interface/presenters/sessions/tree.presenter.ts';
import { useTokenIndex } from '../../hooks/useTokenIndex.ts';
import { AgentChip, CommitChip, IssueChip, RefChip } from '../chips/Chips.tsx';

/* 短い一文の中の語を、観測しているものと突き合わせてチップに変える。

   タイトルや 1 行の要約に使う。本文(Markdown)のほうは `MdView` が受け持つ —
   あちらは組み上がった HTML の文字列を扱うので、同じインデックスでも当て方が違う。 */

/* 語の切り出し。`/` を含めて切るのは、`mgr-x/issue-y` のようなブランチの名を丸ごと当てるため。
   `#` から始まる語も切る — 課題の id は `#209` の形で、番号だけでは引けない。 */
const WORD = /(#[0-9]+|[A-Za-z0-9][\w./-]*)/g;

export function SubjectText({ text, project }: { text: string; project: ProjectJson | undefined }) {
  const dict = useTokenIndex(project);
  // インデックスが空なら突き合わせるものが無い。語ごとに回す手間ごと省く
  if (dict.empty) return <>{text}</>;

  const chipOf = (word: string, key: string): React.ReactNode | null => {
    const hit = dict.lookup(word);
    if (hit === null) return null;
    switch (hit.kind) {
      case 'issue':
        return <IssueChip key={key} id={hit.id} closed={hit.closed} />;
      case 'agent':
        return <AgentChip key={key} file={hit.file} state={hit.state} label={word} />;
      case 'ref':
        return <RefChip key={key} name={word} kind={hit.ref} />;
      case 'commit':
        return <CommitChip key={key} rev={hit.rev} label={word} subject={hit.subject} />;
    }
  };

  const parts = text.split(WORD);
  return (
    <>
      {parts.map((part, index2) => {
        const key = String(index2);
        const hit = chipOf(part, key);
        if (hit !== null) return hit;
        /* ブランチに当たらない、パスのような語は中まで見る。
           `.worktrees/mgr-x/issue-y` の途中に課題の id が挟まっていることがある。 */
        if (part.includes('/')) {
          const pieces = part.split(/(\/)/g);
          const anyHit = pieces.some((piece, i) => i % 2 === 0 && chipOf(piece, '') !== null);
          if (anyHit) {
            return (
              <span key={key}>
                {pieces.map((piece, i) =>
                  i % 2 === 0 ? (chipOf(piece, `${key}.${i}`) ?? piece) : piece,
                )}
              </span>
            );
          }
        }
        return part;
      })}
    </>
  );
}
