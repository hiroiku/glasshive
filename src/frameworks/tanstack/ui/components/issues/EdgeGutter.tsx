import { type Edge, edgeColorOf, LANE_WIDTH } from '../../derive/issueTree.ts';

/* 行の左の余白に、依存の弧を引く。

   Git 画面のブランチの線と同じ描き方にする — 角は丸く、端は丸く、依存する先にだけ矢印。
   2 つの画面で線の意味が同じなら、片方を読めればもう片方も読める。

   **この svg はレイアウトの外に置いてある。** 中に入れると、置換要素の既定の高さ 150px が
   行の高さに混ざって行が伸びる。列の幅は隣に置いた空の要素が確保している。 */

/** 1 行の中での線の高さ。1 行に収めたときの文字の中心 */
const ROW_MID = 14;

/** 角の丸み */
const CORNER = 6;

export function EdgeGutter({
  row,
  edges,
  width,
}: {
  row: number;
  edges: readonly Edge[];
  width: number;
}) {
  const laneX = (lane: number) => width - 14 - lane * LANE_WIDTH;
  const shapes: React.ReactNode[] = [];

  for (const edge of edges) {
    /* React のキーは弧そのものから作る。**並び順の位置からは作らない** — 行が並べ替わると
       位置は動くが、どの課題からどの課題への、どのレーンの弧かは動かない。 */
    const key = `${edge.a}:${edge.b}:${edge.type}:${edge.lane}`;
    const x = laneX(edge.lane);
    const color = edgeColorOf(edge.type);
    /* 端が同じ行に重なることがある。終わり(矢印)を上へ、始まり(丸)を下へずらして、
       どちらの弧の端なのかが見分けられるようにする。 */
    const isEnd = edge.a === row || edge.b === row;
    const mid = isEnd ? (edge.to === row ? ROW_MID - 3 : ROW_MID + 3) : ROW_MID;

    const arrow = (id: string) =>
      shapes.push(
        <polygon
          key={id}
          points={`${width - 7},${mid - 2.5} ${width - 2.5},${mid} ${width - 7},${mid + 2.5}`}
          fill={color}
        />,
      );
    const knob = (id: string) =>
      shapes.push(
        <circle
          key={id}
          cx={width - 5}
          cy={mid}
          r={2.4}
          fill="var(--bg)"
          stroke={color}
          strokeWidth={1.5}
        />,
      );

    if (row === edge.a) {
      shapes.push(
        <path
          key={`c${key}`}
          className="dep"
          stroke={color}
          d={`M ${width - 4} ${mid} L ${x + CORNER} ${mid} Q ${x} ${mid} ${x} ${mid + CORNER}`}
        />,
        <line
          key={`v${key}`}
          className="dep"
          stroke={color}
          x1={x}
          y1={mid + CORNER}
          x2={x}
          y2="100%"
        />,
      );
      if (edge.to === edge.a) arrow(`p${key}`);
      else knob(`d${key}`);
      continue;
    }

    if (row > edge.a && row < edge.b) {
      shapes.push(
        <line key={`v${key}`} className="dep" stroke={color} x1={x} y1={0} x2={x} y2="100%" />,
      );
      continue;
    }

    if (row === edge.b) {
      shapes.push(
        <line
          key={`v${key}`}
          className="dep"
          stroke={color}
          x1={x}
          y1={0}
          x2={x}
          y2={mid - CORNER}
        />,
        <path
          key={`c${key}`}
          className="dep"
          stroke={color}
          d={`M ${x} ${mid - CORNER} Q ${x} ${mid} ${x + CORNER} ${mid} L ${width - 4} ${mid}`}
        />,
      );
      if (edge.to === edge.b) arrow(`p${key}`);
      else knob(`d${key}`);
    }
  }

  // 線は行に書いてあることをなぞるだけの飾り。読み上げからは外す
  return (
    <svg className="dep-gutter" style={{ width }} aria-hidden="true">
      {shapes}
    </svg>
  );
}
