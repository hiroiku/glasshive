import { mdiHomeOutline, mdiRhombus, mdiSourceBranch } from '@mdi/js';
import { hoverTok } from '../../hoverTok.ts';
import { useNav } from '../../nav/NavContext.tsx';
import { pressable } from '../../pressable.ts';
import { Dot } from '../primitives/Dot.tsx';
import { Icon } from '../primitives/Icon.tsx';

/* どの画面にも出る 3 種の札。

   **道を props で受け取らない。** どこからでも道を呼べるので、受け取る必要が無い。
   旧実装はこの `nav` を 30 か所以上に通しており、札を 1 つ置くために
   その場所まで道を運ぶ必要があった。

   どれも載せると本文の側の同じものが光る。押すと、その札が指す先が窓に出る。

   **光らせるのは載せたときだけではない。** 鍵盤で辿っている人には載せる手が無いので、
   焦点が来たときにも同じものを光らせる。

   札そのものは button で置く。中に押しどころを持たない末端なので、要素を変えても
   何も壊れない — 見た目は base.css で button の既定を一度落としてある。 */

/** 載せたときと焦点が来たときに、本文の側の同じ語を光らせる */
const glow = (token: string) => ({
  onMouseEnter: () => hoverTok(token, true),
  onMouseLeave: () => hoverTok(token, false),
  onFocus: () => hoverTok(token, true),
  onBlur: () => hoverTok(token, false),
});

/** エージェントの札。点と名前と居場所。押すと会話が出る */
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
      aria-label={`${label} の会話を開く`}
      // 行そのものの押しどころを乗っ取らない。札は札として押される
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

/** 課題の札。閉じたものは沈めて見せる — 参照の大半は統合済みの課題である */
export function IssueChip({ id, closed = false }: { id: string; closed?: boolean }) {
  const nav = useNav();
  return (
    <button
      type="button"
      className={`ichip${closed ? ' closed' : ''}`}
      title={closed ? `${id} (closed)` : id}
      aria-label={`課題 ${id} を開く`}
      {...pressable(() => nav.openIssue(id), { stopPropagation: true })}
      {...glow(id)}
    >
      <Icon path={mdiRhombus} size={9} className="ichip-i" />
      {id}
    </button>
  );
}

/** 枝 / 作業場所の札。押すと記録の画面のその行へ */
export function RefChip({ name, kind = 'branch' }: { name: string; kind?: 'branch' | 'worktree' }) {
  const nav = useNav();
  return (
    <button
      type="button"
      className="refchip"
      title={name}
      aria-label={`記録の画面で ${name} を見る`}
      {...pressable(() => nav.gotoGit(name), { stopPropagation: true })}
      {...glow(name)}
    >
      <Icon path={kind === 'worktree' ? mdiHomeOutline : mdiSourceBranch} size={10} />
      {name}
    </button>
  );
}
