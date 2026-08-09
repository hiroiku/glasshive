import type { ProjectJson } from '~/interface/presenters/sessions/tree.presenter.ts';
import { useTokenIndex } from '../../hooks/useTokenIndex.ts';
import { AgentChip, IssueChip, RefChip } from '../chips/Chips.tsx';

/* 短い一文の中の語を、観測しているものと突き合わせて札に変える。

   題名や一行の要約に使う。本文(markdown)のほうは `MdView` が受け持つ —
   あちらは組み上がった字を扱うので、同じ突き合わせでも当て方が違う。 */

/** 語の切り出し。`/` を含めて切るのは、`mgr-x/issue-y` のような枝の名を丸ごと当てるため */
const WORD = /([A-Za-z0-9][\w./-]*)/g;

export function SubjectText({ text, project }: { text: string; project: ProjectJson | undefined }) {
  const index = useTokenIndex(project);
  // 索きが空なら突き合わせるものが無い。語ごとに回す手間ごと省く
  if (index.empty) return <>{text}</>;

  const chipOf = (word: string, key: string): React.ReactNode | null => {
    const issue = index.issues.get(word);
    if (issue !== undefined) return <IssueChip key={key} id={issue.id} closed={issue.closed} />;
    const agent = index.agents.get(word);
    if (agent !== undefined)
      return <AgentChip key={key} file={agent.file} state={agent.state} label={word} />;
    const git = index.gits.get(word);
    if (git !== undefined) return <RefChip key={key} name={word} kind={git} />;
    return null;
  };

  const parts = text.split(WORD);
  return (
    <>
      {parts.map((part, index2) => {
        const key = String(index2);
        const hit = chipOf(part, key);
        if (hit !== null) return hit;
        /* 枝に当たらない、道のような語は中まで見る。
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
