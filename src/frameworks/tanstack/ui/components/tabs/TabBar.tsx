import { mdiHomeOutline } from '@mdi/js';
import { Link } from '@tanstack/react-router';
import { useRef, useState } from 'react';
import type { Translator } from '~/interface/i18n/translator.ts';
import type { ProjectJson } from '~/interface/presenters/sessions/tree.presenter.ts';
import { visibleSessions } from '~/interface/presenters/sessions/visibility.presenter.ts';
import { dotFactsOf, dotStateOf, type RowDotState } from '../../derive/overview.ts';
import { counted } from '../../derive/sources.ts';
import { useCommandMark } from '../../hooks/useCommandMark.ts';
import { useHydrated } from '../../hooks/useHydrated.ts';
import { MAX_SLOTS } from '../../hooks/useTabShortcuts.ts';
import { useT } from '../../i18n/useT.ts';
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

/* タブの点。**一覧と同じ 1 つの関数から出す。**

   木は `streamedQuery` で届くので、最初のチャンクでは全プロジェクトが `read: false` の
   スタブである。節を写して先頭の 1 つを落とすと、その間ずっとタブは塗られた `ended` を
   出す —— 同じ画面の Overview が `unknown` と描いている、まさにその行についてである。 */
const dotOf = (project: ProjectJson | undefined): RowDotState =>
  project === undefined ? 'unknown' : dotStateOf(dotFactsOf(project));

/** タブに出す件数と、それに添える一言 */
interface TabCount {
  readonly text: string;
  readonly note: string | undefined;
  /** `+?` は 1 文字ぶんの枠に収まらない。枠を広げないと、隣の名前と × に重なる */
  readonly wide: boolean;
}

/* タブの件数。**そのプロジェクトを開くかどうかを決める最初の手掛かりなので、断定して
   出してはいけない。**

   読む前は数そのものをまだ持っていないので `?` だけを出す。空欄にすると、届いたばかりの
   スタブが「ここでは何も動いていない」と言うことになる。数え上げられなかったときは、
   見えた数が下限でしかないことを `+?` で言う。 */
function countOf(t: Translator, project: ProjectJson | undefined, nowMs: number): TabCount {
  // 木そのものがまだ届いていない。プロジェクトが在るかどうかも観測していない
  if (project === undefined) return { text: '', note: undefined, wide: false };
  if (!project.read) return { text: '?', note: t('Not read yet'), wide: false };
  /* 終わったものは数えない。**タブの数は「ここで何が動いているか」である。**
     Agents の絞り込みに追随させると、そちらを押した人のタブ行が全部書き換わり、
     どのプロジェクトを開くかを決める手掛かりが、絞り込みの都合で動く。 */
  const shown = visibleSessions(project, false, nowMs).length;
  if (!counted(project)) {
    return {
      text: `${shown}+?`,
      note: t('Some of this project could not be read — the count may be short'),
      wide: true,
    };
  }
  return { text: shown === 0 ? '' : String(shown), note: undefined, wide: false };
}

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
}

export function TabBar({
  visible,
  pinned,
  projects,
  onUnpin,
  onPin,
  onMove,
  current,
}: TabBarProps) {
  const t = useT();
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
      <span>{t('Overview')}</span>
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
    <nav id="tabs" ref={navRef} aria-label={t('Pinned projects')}>
      {/* Overview へ戻るタブ。**ピン留めが空でも消えない** — 消えると戻る手段が無くなる */}
      <span className="tab">
        {hydrated ? (
          <Link
            to="/"
            className="tab-link"
            activeProps={{ className: 'tab-link on' }}
            activeOptions={{ exact: true }}
            title={`${t('Overview')}${slotMark(1)}`}
          >
            {home}
          </Link>
        ) : (
          <a className="tab-link" href="/" title={`${t('Overview')}${slotMark(1)}`}>
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
        const count = countOf(t, project, nowMs);
        const dot = dotOf(project);
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
              title={t('{name}{slot} — drag to reorder', {
                name: project?.path ?? id,
                slot: slotMark(index + 2),
              })}
              /* リンクは既定でブラウザーの掴み方を持っている。切らないと、掴んだ瞬間に
                 そちらが始まって `mousemove` も `mouseup` も来なくなる */
              draggable={false}
            >
              <Dot state={dot} />
              <span>{name}</span>
            </Link>
            {/* 件数と × を同じ枠に重ねる。ホバーで入れ替わるだけで、枠の幅は変わらない。

                断定できない件数には `?` を添える。**0 も空欄も「1 つも動いていない」という
                断定になる。** 一言は枠そのものに付ける —— 件数に付けても、上に重なる ×
                がホバーを受け取る。 */}
            <span className={count.wide ? 'tab-slot short' : 'tab-slot'} title={count.note}>
              {/* 人の入力を待っているプロジェクトは、件数の色でもそう言う。タブは畳まれていて
                  中が見えないので、点 1 つだけだと隣のタブの点に紛れる */}
              <span className={dot === 'input' ? 'n input' : 'n'}>{count.text}</span>
              <button
                type="button"
                className="tab-close"
                aria-label={t('Unpin {name}', { name })}
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
            title={t('{name} — double-click to pin', {
              name: byId.get(provisional)?.path ?? provisional,
            })}
          >
            <Dot state={dotOf(byId.get(provisional))} />
            <span>{byId.get(provisional)?.name ?? provisional}</span>
          </Link>
        </span>
      )}
    </nav>
  );
}
