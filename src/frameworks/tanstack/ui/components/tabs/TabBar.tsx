import { mdiHomeOutline } from '@mdi/js';
import { Link } from '@tanstack/react-router';
import { useRef, useState } from 'react';
import type { ProjectJson } from '~/interface/presenters/sessions/tree.presenter.ts';
import {
  projectDotState,
  visibleSessions,
} from '~/interface/presenters/sessions/visibility.presenter.ts';
import { useCommandMark } from '../../hooks/useCommandMark.ts';
import { useHydrated } from '../../hooks/useHydrated.ts';
import { MAX_SLOTS } from '../../hooks/useTabShortcuts.ts';
import { Dot } from '../primitives/Dot.tsx';
import { Icon } from '../primitives/Icon.tsx';

/* タブ行。ピン留めしたものが、留めた順に並ぶ。

   **幅を動かさない。** 件数と閉じる × は同じ場所に置き、ホバーしたときに差し替える。
   × が現れて行が伸びると隣が動き、押すつもりのなかったタブを外してしまう。
   タブは位置で覚えて選ぶものなので、位置が動くこと自体が壊れている。

   キーボードから選べることは、ホバー時の `title` で言う。行の見た目は変えない —
   番号を文字として出すと、幅がタブごとに変わって位置が動く。 */

/** 掴んだと見なすまでの横の移動。これより小さい動きは、押しただけとして扱う */
const DRAG_SLOP = 4;

/** 掴んだ後の押下を飲む。置いた場所のタブが開いてしまうのを止める */
const swallow = (event: Event) => {
  event.preventDefault();
  event.stopPropagation();
};

export interface TabBarProps {
  /** タブに出す id。**ピン留めの一覧そのものではない** — 観測に在るものだけが渡ってくる */
  readonly visible: readonly string[];
  /** ピン留めの並び。動かす先はこちらの位置で言う — 観測から消えたものもここには残る */
  readonly pinned: readonly string[];
  readonly onPin: (id: string) => void;
  readonly onMove: (id: string, toIndex: number) => void;
  /* 観測できたプロジェクト。**まだ木が届いていない間は `undefined` である。**
     空の配列へ潰すと「1 つも観測できなかった」と見分けが付かなくなり、
     届くのを待っているだけのタブまで、消えたタブとして落ちる。 */
  readonly projects: readonly ProjectJson[] | undefined;
  readonly onUnpin: (id: string) => void;
  /* いま開いているが、ピン留めしていないプロジェクト。末尾に暫定タブとして出す。
     出さないと、ピン留めしていないプロジェクトを見ているあいだ、自分がどこに居るかが
     タブ行から消える。 */
  readonly current: string | null;
  /** 終わったものも数に入れるか。表に出ている件数とタブの件数を揃える */
  readonly showAll: boolean;
}

export function TabBar({
  visible,
  pinned,
  projects,
  onUnpin,
  onPin,
  onMove,
  current,
  showAll,
}: TabBarProps) {
  const byId = new Map((projects ?? []).map((project) => [project.id, project]));
  /* 木が届いているか。**届く前と、届いた上で見つからないのは別である。**
     前者は待っているだけなのでタブを出す。後者は観測から消えた id なので落とす。 */
  const observed = projects !== undefined;
  /* HTML シェル(`_shell.html`)はどのルートでも同じものなので、hydrate するまでは
     ルートのことを言わない。暫定タブも「いま居るルート」から出るものなので、
     hydrate してから足す。 */
  const hydrated = useHydrated();
  const here = hydrated ? current : null;
  const provisional = here !== null && !visible.includes(here) ? here : null;
  /* 件数を数えるときの現在時刻。**タブごとに引き直さない** — 引き直すと、同じタブ行の
     中で見える数と見えない数の境目がずれる。 */
  const nowMs = Date.now();
  const mark = useCommandMark();
  // タブの番号は並び順そのもの。Overview が 1、ピン留めしたものが 2 から続く
  const slotMark = (slot: number) => (slot > MAX_SLOTS ? '' : ` (${mark}${slot})`);
  const home = (
    <>
      <Icon path={mdiHomeOutline} size={12} />
      <span>Overview</span>
    </>
  );

  /* 掴んで並べ替える。**押しただけと掴んだのを、動いた距離で分ける** —— タブは押して開く
     ものでもあるので、少しでも動いたら掴んだことにすると、開くつもりの押下が並べ替えになる。

     置く先は掴んだものを除いた並びで数える。`onMove` の `toIndex` も、掴んだものを抜いた後の
     位置で受けるので、そのまま渡せる。掴んでいる間は隣を動かさず、入る場所に線を 1 本引く —
     隣を押しのけると、狙っていた場所そのものが動く。 */
  const [drop, setDrop] = useState<{ id: string; x: number } | null>(null);
  const navRef = useRef<HTMLElement>(null);

  const grab = (id: string) => (event: React.MouseEvent) => {
    const nav = navRef.current;
    if (event.button !== 0 || nav === null) return;
    const x0 = event.clientX;
    const origin = nav.getBoundingClientRect().left - nav.scrollLeft;
    const others = [...nav.querySelectorAll<HTMLElement>('.tab[data-pin]')]
      .filter((tab) => tab.dataset.pin !== id)
      .map((tab) => ({ id: tab.dataset.pin ?? '', rect: tab.getBoundingClientRect() }));

    let at: number | null = null;

    const move = (moved: MouseEvent) => {
      if (at === null && Math.abs(moved.clientX - x0) < DRAG_SLOP) return;
      document.body.classList.add('dragging');
      at = others.filter((other) => other.rect.left + other.rect.width / 2 < moved.clientX).length;
      const edge = at === 0 ? (others[0]?.rect.left ?? 0) : (others[at - 1]?.rect.right ?? origin);
      setDrop({ id, x: edge - origin });
    };

    const up = () => {
      document.removeEventListener('mousemove', move);
      document.removeEventListener('mouseup', up);
      document.body.classList.remove('dragging');
      setDrop(null);
      if (at === null) return;
      /* タブを掴んで放した後の押下は、開くための押下ではない。飲まないと、置いた瞬間にそこへ移動する */
      document.addEventListener('click', swallow, { capture: true, once: true });
      const before = others[at]?.id;
      const rest = pinned.filter((other) => other !== id);
      const toIndex = before === undefined ? rest.length : rest.indexOf(before);
      if (toIndex >= 0) onMove(id, toIndex);
    };

    document.addEventListener('mousemove', move);
    document.addEventListener('mouseup', up);
  };

  return (
    <nav id="tabs" ref={navRef} aria-label="Pinned projects">
      {/* Overview へ戻るタブ。**ピン留めが空でも消えない** — 消えると戻る手段が無くなる */}
      <span className="tab">
        {hydrated ? (
          <Link
            to="/"
            className="tab-link"
            activeProps={{ className: 'tab-link on' }}
            activeOptions={{ exact: true }}
            title={`Overview${slotMark(1)}`}
          >
            {home}
          </Link>
        ) : (
          <a className="tab-link" href="/" title={`Overview${slotMark(1)}`}>
            {home}
          </a>
        )}
      </span>

      {visible.map((id, index) => {
        const project = byId.get(id);
        // 観測から消えた id。**待っているのではなく、もう無い**
        if (project === undefined && observed) return null;
        /* 木が届くまでは id そのものを名前として出す。**id は観測ではなく URL の値である。**
           ここでタブごと落とすと、ピン留めしたプロジェクトを直に開いたユーザーには、
           いまどこに居るかがどこにも出ない画面になる(アドレスバーを読むしか手が無くなる)。 */
        const name = project?.name ?? id;
        const shown = project === undefined ? 0 : visibleSessions(project, showAll, nowMs).length;
        return (
          // biome-ignore lint/a11y/noStaticElementInteractions: 掴むのは並べ替えの手立てで、開くのは中の `Link` が受ける
          <span
            key={id}
            className={`tab${drop?.id === id ? ' grabbed' : ''}`}
            data-pin={id}
            onMouseDown={grab(id)}
          >
            <Link
              to="/projects/$slug"
              params={{ slug: id }}
              className="tab-link"
              activeProps={{ className: 'tab-link on' }}
              title={`${project?.path ?? id}${slotMark(index + 2)} — drag to reorder`}
              /* リンクは既定でブラウザーの掴み方を持っている。切らないと、掴んだ瞬間に
                 そちらが始まって `mousemove` も `mouseup` も来なくなる */
              draggable={false}
            >
              <Dot state={project === undefined ? 'unknown' : projectDotState(project)} />
              <span>{name}</span>
            </Link>
            {/* 件数と × を同じ枠に重ねる。ホバーで入れ替わるだけで、枠の幅は変わらない */}
            <span className="tab-slot">
              <span className="n">{shown === 0 ? '' : shown}</span>
              <button
                type="button"
                className="tab-close"
                aria-label={`Unpin ${name}`}
                onClick={() => onUnpin(id)}
              >
                ×
              </button>
            </span>
          </span>
        );
      })}

      {drop !== null && <span className="tab-drop" style={{ left: drop.x }} />}

      {/* 暫定タブはダブルクリックで留める。**押しただけでは留めない** —
          Overview から開いただけのプロジェクトが、見ただけでタブに残り続けることになる */}
      {provisional !== null && (
        // biome-ignore lint/a11y/noStaticElementInteractions: 留めるのは中の `Link` の上での二度押しで、これ自体は開く場所ではない
        <span className="tab provisional" onDoubleClick={() => onPin(provisional)}>
          <Link
            to="/projects/$slug"
            params={{ slug: provisional }}
            className="tab-link on"
            title={`${byId.get(provisional)?.path ?? provisional} — double-click to pin`}
          >
            {(() => {
              const project = byId.get(provisional);
              return <Dot state={project === undefined ? 'unknown' : projectDotState(project)} />;
            })()}
            <span>{byId.get(provisional)?.name ?? provisional}</span>
          </Link>
        </span>
      )}
    </nav>
  );
}
