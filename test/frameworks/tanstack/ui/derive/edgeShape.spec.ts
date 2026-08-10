import { describe, expect, it } from 'vitest';
import {
  ARROW,
  arrowPoints,
  EDGE_CORNER,
  roundedPath,
} from '~/frameworks/tanstack/ui/derive/edgeShape.ts';

/* 線の形は、2 つの画面が同じものを使うために切り出してある。

   **ここが崩れると、依存の絵が別のものを指す。** 角を丸めた拍子に端が動けば矢の先が
   カードから外れ、丸みが線分より大きければ線が逆走する。どちらも絵としては出てしまうので、
   目では気付けない。 */

/** `d` の中の座標を数の組に戻す */
const pointsOf = (d: string): [number, number][] => {
  const found: [number, number][] = [];
  for (const match of d.matchAll(/(-?[\d.]+) (-?[\d.]+)/g)) {
    found.push([Number(match[1]), Number(match[2])]);
  }
  return found;
};

describe('角だけを丸めた線', () => {
  it('折れ点が無ければ、2 点を結ぶだけ', () => {
    expect(
      roundedPath([
        [0, 0],
        [100, 0],
      ]),
    ).toBe('M 0 0 L 100 0');
  });

  it('始点と終点は動かない', () => {
    const d = roundedPath([
      [10, 20],
      [60, 20],
      [60, 90],
    ]);
    const points = pointsOf(d);

    expect(points[0], '端が動くと、矢の先がカードから外れる').toEqual([10, 20]);
    expect(points[points.length - 1]).toEqual([60, 90]);
  });

  it('折れ点そのものは通らず、その手前と先を結ぶ', () => {
    const d = roundedPath([
      [0, 0],
      [50, 0],
      [50, 50],
    ]);

    expect(d).toContain(`L ${50 - EDGE_CORNER} 0`);
    expect(d).toContain(`Q 50 0 50 ${EDGE_CORNER}`);
  });

  it('線分が短いときは、丸みを線分の半分まで縮める', () => {
    // 縦が 4px しかない。既定の丸み 6px をそのまま使うと、角が次の角を追い越す
    const d = roundedPath([
      [0, 0],
      [40, 0],
      [40, 4],
      [80, 4],
    ]);
    const ys = pointsOf(d).map(([, y]) => y);

    expect(Math.max(...ys), '丸みが線分を越えると、線が行き過ぎてから戻る').toBeLessThanOrEqual(4);
  });

  it('同じ点が続いても、角を作らない', () => {
    const d = roundedPath([
      [0, 0],
      [0, 0],
      [40, 0],
    ]);

    expect(d, '長さの無い線分を角として丸めると、丸みの向きが決まらない').toBe('M 0 0 L 40 0');
  });

  it('点が無ければ、何も描かない', () => {
    expect(roundedPath([])).toBe('');
  });
});

describe('矢じり', () => {
  it('先端が渡した位置に来て、向きは右', () => {
    const points = arrowPoints(100, 50)
      .split(' ')
      .map((pair) => pair.split(',').map(Number));

    expect(points[1], '先端が指定の位置からずれると、矢がカードに刺さらない').toEqual([100, 50]);
    expect(points[0]).toEqual([100 - ARROW.length, 50 - ARROW.half]);
    expect(points[2]).toEqual([100 - ARROW.length, 50 + ARROW.half]);
  });
});
