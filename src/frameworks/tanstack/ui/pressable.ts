import type { KeyboardEvent, MouseEvent } from 'react';

/* 押せる場所を、鍵盤からも押せるようにする。

   **押しどころを button に置き換えない。** 行も札も入れ子の格子(subgrid)の中に居て、
   要素の種類を変えると親が敷いた筋を継がなくなり、列が揃わなくなる。
   足すのは印だけ — `role="button"` と `tabIndex={0}` を置いた上で、ここが鍵を受ける。

   役と焦点の順は**書く側が字で置く**。ここから配ると、読む側にも検める側にも
   その要素が何であるかが見えなくなる。

   Enter と空白の両方を受ける。見た目が押しどころなら、button と同じ鍵で動かないと、
   辿っている人には壊れているようにしか見えない。 */

export interface PressableOptions {
  /** 外側の押しどころへ伝えないか。札のように、押せるものの中に居るものは止める */
  readonly stopPropagation?: boolean;
}

export function pressable(activate: () => void, options: PressableOptions = {}) {
  const fire = (event: MouseEvent | KeyboardEvent) => {
    if (options.stopPropagation === true) event.stopPropagation();
    activate();
  };

  return {
    onClick: fire,
    onKeyDown: (event: KeyboardEvent) => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      // 空白で画面が飛ばないように、ここで受け切る
      event.preventDefault();
      fire(event);
    },
  };
}
