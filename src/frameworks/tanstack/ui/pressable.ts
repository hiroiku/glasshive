import type { KeyboardEvent, MouseEvent } from 'react';

/* 押せる場所を、キーボードからも押せるようにする。

   **押しどころを button に置き換えない。** 行もチップも入れ子のグリッド(`subgrid`)の中に居て、
   要素の種類を変えると親が敷いたトラックを継がなくなり、列が揃わなくなる。
   足すのは属性だけ — `role="button"` と `tabIndex={0}` を置いた上で、ここがキーを受ける。

   役とフォーカスの順は書く側が JSX に直接書く。ここから配ると、読む側にも検証する側にも
   その要素が何であるかが見えなくなる。

   Enter と空白の両方を受ける。見た目が押しどころなら、button と同じキーで動かないと、
   辿っている人には壊れているようにしか見えない。 */

export interface PressableOptions {
  /** 外側の押しどころへ伝えないか。チップのように、押せるものの中に居るものは止める */
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
