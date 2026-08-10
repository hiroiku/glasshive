import { mdiHomeOutline, mdiRhombus, mdiSourceBranch, mdiSourceCommit } from '@mdi/js';
import { commitToken } from '../../derive/tokens.ts';
import { hoverTok } from '../../hoverTok.ts';
import { useNav } from '../../nav/NavContext.tsx';
import { pressable } from '../../pressable.ts';
import { Dot } from '../primitives/Dot.tsx';
import { Icon } from '../primitives/Icon.tsx';

/* どの画面にも出る 4 種のチップ。

   ルーターは props で受け取らない。どこからでも `useNav()` を呼べるので、通す必要が無い。

   どれもホバーすると本文側の同じ語がハイライトされ、クリックするとチップが指す先が
   サイドパネルに開く。**ハイライトはホバーだけでなくフォーカスでも起こす** —
   キーボードで辿るユーザーにはホバーが無いので、ここを落とすと何も光らない。

   チップ自体は button で置く。中に押しどころを持たない末端なので、要素を変えても
   何も壊れない。見た目は `base.css` が button の既定を一度落としている。 */

/** ホバーとフォーカスで、本文側の同じ語をハイライトする */
const glow = (token: string) => ({
  onMouseEnter: () => hoverTok(token, true),
  onMouseLeave: () => hoverTok(token, false),
  onFocus: () => hoverTok(token, true),
  onBlur: () => hoverTok(token, false),
});

/** エージェントのチップ。状態の点と名前と worktree。押すと会話パネルが開く */
export function AgentChip({
  file,
  state,
  label,
  where,
}: {
  file: string;
  state: string;
  label: string;
  where?: string | null;
}) {
  const nav = useNav();
  return (
    <button
      type="button"
      className="wk"
      title={file}
      aria-label={`Open conversation for ${label}`}
      // 行そのもののクリックを乗っ取らない。チップはチップとして押される
      {...pressable(() => nav.openConv(file), { stopPropagation: true })}
      {...glow(file)}
    >
      <Dot state={state} />
      {label}
      {where !== null && where !== undefined && where !== '' && (
        <span className="where">@{where}</span>
      )}
    </button>
  );
}

/** 課題のチップ。閉じたものは沈めて見せる — 参照の大半は統合済みの課題である */
export function IssueChip({ id, closed = false }: { id: string; closed?: boolean }) {
  const nav = useNav();
  return (
    <button
      type="button"
      className={`ichip${closed ? ' closed' : ''}`}
      title={closed ? `${id} (closed)` : id}
      aria-label={`Open issue ${id}`}
      {...pressable(() => nav.openIssue(id), { stopPropagation: true })}
      {...glow(id)}
    >
      <Icon path={mdiRhombus} size={9} className="ichip-i" />
      {id}
    </button>
  );
}

/* コミットのチップ。押すと、その `ref` の詳細がサイドパネルに出る。

   **書かれていた桁数のまま見せる。** 7 桁で書かれたものを 40 桁に伸ばすと、
   本文とチップで別のものを見ている気になる。リンク先だけを完全な sha で持つ。 */
export function CommitChip({
  rev,
  label,
  subject,
}: {
  rev: string;
  label: string;
  subject: string;
}) {
  const nav = useNav();
  return (
    <button
      type="button"
      className="refchip commit"
      title={subject === '' ? rev : `${rev} — ${subject}`}
      aria-label={`View commit ${label}`}
      {...pressable(() => nav.openRef(rev, label), { stopPropagation: true })}
      {...glow(commitToken(rev))}
    >
      <Icon path={mdiSourceCommit} size={10} />
      {label}
    </button>
  );
}

/** ブランチ / worktree のチップ。押すと Git 画面のその行へ */
export function RefChip({ name, kind = 'branch' }: { name: string; kind?: 'branch' | 'worktree' }) {
  const nav = useNav();
  return (
    <button
      type="button"
      className="refchip"
      title={name}
      aria-label={`View ${name} in Git`}
      {...pressable(() => nav.gotoGit(name), { stopPropagation: true })}
      {...glow(name)}
    >
      <Icon path={kind === 'worktree' ? mdiHomeOutline : mdiSourceBranch} size={10} />
      {name}
    </button>
  );
}
