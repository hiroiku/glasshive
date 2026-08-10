/* 依存の線の形。**一覧の弧と依存グラフの辺で、同じものを使う。**

   同じ依存を 2 つの画面が別の見た目で出すと、片方を読めてももう片方は読み直しになる。
   矢じりの大きさも角の丸みも、ここ 1 か所で決める。 */

/** 角の丸み */
export const EDGE_CORNER = 6;

/* 矢じり 1 つの大きさ。**一覧の側が正である** —— 行の高さが狭く、ここより大きくすると
   隣の行の弧に被る。グラフの側は余裕があるので、狭いほうに合わせられる。 */
export const ARROW = { length: 4.5, half: 2.5 } as const;

/** 矢じりの多角形。`x`, `y` は矢の先端で、向きは右 */
export const arrowPoints = (x: number, y: number): string =>
  `${x - ARROW.length},${y - ARROW.half} ${x},${y} ${x - ARROW.length},${y + ARROW.half}`;

/** 桁を落とす。`d` の文字列が長くなるだけで、これ以上の精度は画面に出ない */
const round = (value: number): number => Math.round(value * 100) / 100;

/** 折れ点から隣の点の向きへ `distance` だけ進んだ位置 */
function toward(
  from: readonly [number, number],
  to: readonly [number, number],
  distance: number,
): [number, number] {
  const dx = to[0] - from[0];
  const dy = to[1] - from[1];
  const length = Math.hypot(dx, dy);
  if (length === 0) return [from[0], from[1]];
  return [from[0] + (dx / length) * distance, from[1] + (dy / length) * distance];
}

/* 直角に折れる線を、角だけ丸めた 1 本の `d` にする。

   曲線で結ぶと、どこを通っているのかが読めない。折れ点を残して角だけ丸めれば、線が
   どこを通っているかがそのまま読める —— Git の画面のブランチの線と同じ描き方である。

   丸める幅は隣り合う線分の半分までに抑える。**抑えないと、丸めた角が次の角を追い越して
   線が逆走する** —— 短い線分が 1 本混じるだけで起きる。 */
export function roundedPath(
  points: readonly (readonly [number, number])[],
  radius: number = EDGE_CORNER,
): string {
  const head = points[0];
  if (head === undefined) return '';

  let d = `M ${round(head[0])} ${round(head[1])}`;
  for (let at = 1; at < points.length - 1; at++) {
    const before = points[at - 1];
    const corner = points[at];
    const after = points[at + 1];
    if (before === undefined || corner === undefined || after === undefined) continue;

    const back = Math.hypot(corner[0] - before[0], corner[1] - before[1]) / 2;
    const ahead = Math.hypot(after[0] - corner[0], after[1] - corner[1]) / 2;
    const r = Math.min(radius, back, ahead);
    if (r <= 0) continue;

    const start = toward(corner, before, r);
    const end = toward(corner, after, r);
    d +=
      ` L ${round(start[0])} ${round(start[1])}` +
      ` Q ${round(corner[0])} ${round(corner[1])} ${round(end[0])} ${round(end[1])}`;
  }

  const tail = points[points.length - 1];
  if (tail !== undefined) d += ` L ${round(tail[0])} ${round(tail[1])}`;
  return d;
}
