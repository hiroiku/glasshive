import { type GitLayout, LANE_GAP, MAINLINE_COLOR, ROW_HEIGHT } from '../../derive/gitGraph.ts';
import { laneColor } from '../../palette.ts';

/* 行 1 つを通る線と点。

   行ごとに小さな svg を縦に連ねる。1 枚の大きな svg に描かないのは、行の高さが
   中身で変わることと、行を絞ったときに線だけが取り残されるのを避けるためである。

   線は縦に伸び、合流する行で丸角の肘を曲がって柱へ入る。**曲がる向きは 1 つだけ** —
   線が左右に振れると、どの線がどこへ行くのか目で追えなくなる。 */

export interface GitGutterProps {
  readonly row: number;
  readonly layout: GitLayout;
  /** 生きている線の行 → そこに立っている手の様子。空なら誰も居ない */
  readonly tipStates: ReadonlyMap<number, string>;
  /** 明滅の位相。全部の点を同じ息づかいに揃える */
  readonly delay: string;
}

export function GitGutter({ row, layout, tipStates, delay }: GitGutterProps) {
  const { rows, firstMain, baseIndex, width } = layout;
  const x = (lane: number) => 8 + LANE_GAP * lane;
  const mid = ROW_HEIGHT / 2;
  const shapes: React.ReactNode[] = [];
  const here = rows[row];
  if (here === undefined) return null;

  // 本流の柱
  if (row >= firstMain) {
    if (here.type === 'fold') {
      shapes.push(
        <line
          key="main"
          className="gl"
          x1={x(0)}
          y1={2}
          x2={x(0)}
          y2={ROW_HEIGHT - 2}
          stroke={MAINLINE_COLOR}
          strokeWidth={2}
          strokeDasharray="2 4"
        />,
      );
    } else {
      shapes.push(
        <line
          key="main"
          className="gl"
          x1={x(0)}
          y1={row === firstMain ? mid : 0}
          x2={x(0)}
          y2={row === rows.length - 1 ? mid : ROW_HEIGHT}
          stroke={MAINLINE_COLOR}
          strokeWidth={2}
        />,
      );
    }
    if (here.type === 'node') {
      if (here.node.merge) {
        shapes.push(
          <circle key="dot" cx={x(0)} cy={mid} r={4.5} className="gd-merge" />,
          <circle key="hole" cx={x(0)} cy={mid} r={2} className="gd-hole" />,
        );
      } else {
        shapes.push(<circle key="dot" cx={x(0)} cy={mid} r={3} className="gd-commit" />);
      }
    }
  }

  // 生きている線
  rows.forEach((other, at) => {
    if (other.type !== 'tip') return;
    const lane = other.lane;
    const color = laneColor(lane - 1);
    const joinAt = baseIndex.get(at) ?? rows.length - 1;
    const lineX = x(lane);

    if (row === at) {
      if (joinAt > row) {
        shapes.push(
          <line
            key={`v${lane}`}
            className="gl"
            x1={lineX}
            y1={mid}
            x2={lineX}
            y2={ROW_HEIGHT}
            stroke={color}
          />,
        );
      }
      shapes.push(
        <circle
          key={`t${lane}`}
          cx={lineX}
          cy={mid}
          r={4.5}
          fill="var(--bg)"
          stroke={color}
          strokeWidth={2}
        />,
      );
      const state = tipStates.get(at);
      /* 誰か居るなら、その様子で息づく点にする。居ないなら、ただの静かな点。
       **輪だけにしない** — 輪だけだと「線が在る」としか読めず、人が居るかが消える。 */
      shapes.push(
        state === undefined || state === '' ? (
          <circle key={`s${lane}`} cx={lineX} cy={mid} r={2} fill={color} opacity={0.7} />
        ) : (
          <circle
            key={`s${lane}`}
            cx={lineX}
            cy={mid}
            r={2.4}
            className={`gd-state ${state}`}
            style={{ animationDelay: delay }}
          />
        ),
      );
      return;
    }

    if (row > at && row < joinAt) {
      shapes.push(
        <line
          key={`v${lane}`}
          className="gl"
          x1={lineX}
          y1={0}
          x2={lineX}
          y2={ROW_HEIGHT}
          stroke={color}
        />,
      );
      return;
    }

    if (row === joinAt) {
      const corner = Math.min(10, mid - 2);
      shapes.push(
        <path
          key={`c${lane}`}
          className="gl"
          stroke={color}
          d={`M ${lineX} 0 L ${lineX} ${mid - corner} Q ${lineX} ${mid} ${lineX - corner} ${mid} L ${x(0) + 5} ${mid}`}
        />,
      );
    }
  });

  // 筋は行に書いてあることをなぞるだけの飾り。読み上げからは外す
  return (
    <svg className="g-gutter" width={width} height={ROW_HEIGHT} aria-hidden="true">
      {shapes}
    </svg>
  );
}
