import { useNavigate } from '@tanstack/react-router';
import { useEffect } from 'react';
import { isApple } from '../platform.ts';

/* タブ行をキーボードから扱う。位置で選び、位置を入れ替える。

   タブは位置で覚えて選ぶものなので、キーボードに割り当てるならその位置がそのまま
   番号になる。1 が一覧、2 から先がピン留めしたものである。

   **文字を入力している手からは奪わない。** macOS では ⌘⇧← が「行の頭まで選ぶ」なので、
   検索欄に居るあいだに奪うと、選ぼうとした人のタブが黙って動く。 */

/** 位置で選べる数。行の頭から数えて、これより先は番号を振らない */
export const MAX_SLOTS = 9;

/* ⌘ に当たる修飾キー。両方を受けると、Ctrl+数字がブラウザーのタブ切替と重なる環境で二重に効く。 */
const commandKey = (event: KeyboardEvent): boolean => (isApple() ? event.metaKey : event.ctrlKey);

const isTyping = (target: EventTarget | null): boolean => {
  const element = target as HTMLElement | null;
  if (element === null) return false;
  const tag = element.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || element.isContentEditable;
};

export interface TabShortcutsProps {
  /** タブ行に出ているプロジェクトの id。行の並びそのもの */
  readonly visible: readonly string[];
  /** ピン留めの並び。動かす先はこちらの位置で数える */
  readonly pinned: readonly string[];
  readonly current: string | null;
  readonly onMove: (id: string, toIndex: number) => void;
}

export function useTabShortcuts({ visible, pinned, current, onMove }: TabShortcutsProps) {
  const navigate = useNavigate();

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (!commandKey(event) || isTyping(event.target)) return;

      if (!event.shiftKey && event.key >= '1' && event.key <= '9') {
        const slot = Number(event.key) - 1;
        if (slot >= MAX_SLOTS) return;
        // そこにタブが無ければ何もしない。何もしないと分かるほうが、隣へ飛ぶより良い
        if (slot === 0) {
          event.preventDefault();
          void navigate({ to: '/' });
          return;
        }
        const id = visible[slot - 1];
        if (id === undefined) return;
        event.preventDefault();
        void navigate({ to: '/projects/$slug', params: { slug: id } });
        return;
      }

      if (!event.shiftKey) return;
      const step = event.key === 'ArrowLeft' ? -1 : event.key === 'ArrowRight' ? 1 : 0;
      if (step === 0 || current === null) return;
      // 押しっぱなしの連射で動かさない。1 回ごとに `preferences.json` へ置きに行く
      if (event.repeat) return;

      const at = visible.indexOf(current);
      if (at < 0) return;
      /* 隣は**行に出ている**ほうで数え、置く先はピン留めの位置で言う。
         ピン留めには観測から消えたものも残っているので、ピン留めの上で 1 つ動かしても
         行の上では何も動かないことがある。 */
      const neighbour = visible[at + step];
      if (neighbour === undefined) return;
      const toIndex = pinned.indexOf(neighbour);
      if (toIndex < 0) return;
      event.preventDefault();
      onMove(current, toIndex);
    };

    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [visible, pinned, current, onMove, navigate]);
}
