import { useState } from 'react';

/* 図の上のカーソルを追う。何本目のバーの上に居るかと、横の位置(0〜1)を返す。

   図そのものはバーを並べるだけで、どこに居るかは知らない。知る役をここに分けてあるのは、
   2 枚の図が同じ追い方をするからである。 */

export interface ChartHover {
  readonly at: { readonly bar: number; readonly fraction: number } | null;
  readonly onMouseMove: (event: React.MouseEvent<HTMLElement>) => void;
  readonly onMouseLeave: () => void;
}

export function useChartHover(bars: number): ChartHover {
  const [at, setAt] = useState<{ bar: number; fraction: number } | null>(null);

  return {
    at,
    onMouseMove: (event) => {
      const box = event.currentTarget.getBoundingClientRect();
      const fraction = Math.min(1, Math.max(0, (event.clientX - box.left) / box.width));
      setAt({ bar: Math.min(bars - 1, Math.floor(fraction * bars)), fraction });
    },
    onMouseLeave: () => setAt(null),
  };
}
