import { scaleLinear } from 'd3-scale';
import { area as areaOf, curveStepAfter, line as lineOf } from 'd3-shape';
import { mdhm } from '../../format.ts';
import { useChartHover } from '../../hooks/useChartHover.ts';
import { TimeTicks } from '../primitives/TimeTicks.tsx';

/* 同時に動いていたエージェントの数。

   階段状の面で描くのは、**この数が整数だから**である。滑らかに繋ぐと、
   3 と 4 の間に「3.5 エージェント」の時間が在ったように見える。`d3-shape` の
   `curveStepAfter` がその階段そのもので、高さの物差しは `d3-scale` が持つ。 */

export interface ConcurrencyPanelProps {
  readonly counts: readonly number[];
  readonly fromMs: number;
  readonly footMs: number;
  readonly bars: number;
  readonly nowMs: number;
  /** いま動いているエージェントの数。グラフとは別に、今この瞬間を出す */
  readonly liveNow: number;
}

export function ConcurrencyPanel({
  counts,
  fromMs,
  footMs,
  bars,
  nowMs,
  liveNow,
}: ConcurrencyPanelProps) {
  const hover = useChartHover(bars);
  const peak = Math.max(0, ...counts);
  const ceiling = Math.max(1, peak);

  const y = scaleLinear().domain([0, ceiling]).range([55, 5]);
  const x = scaleLinear()
    .domain([0, counts.length])
    .range([0, bars * 10]);
  const stepArea = areaOf<number>()
    .x((_, index) => x(index))
    .y0(56)
    .y1((value) => y(value))
    .curve(curveStepAfter);
  const stepLine = lineOf<number>()
    .x((_, index) => x(index))
    .y((value) => y(value))
    .curve(curveStepAfter);
  const area = stepArea([...counts]) ?? '';
  const top = stepLine([...counts]) ?? '';

  const at = hover.at;

  return (
    <div className="sf-panel sf-conc">
      <div className="sf-h">
        <span className="sf-title">Agents</span>
        <span className="sf-dim">now {liveNow}</span>
        <span className="sf-big" title="Peak agents concurrent in range">
          peak {peak}
        </span>
      </div>

      {/* ホバーすると、そのバー 1 本ぶんの同時数をツールチップに出す。グラフ自体の要旨は
          svg の `title` が持っているので、ホバーできない人にも届く */}
      {/* biome-ignore lint/a11y/noStaticElementInteractions: ホバーして読むためだけの面 */}
      <div className="sf-plot" onMouseMove={hover.onMouseMove} onMouseLeave={hover.onMouseLeave}>
        <svg
          className="sf-svg"
          viewBox={`0 0 ${bars * 10} 56`}
          preserveAspectRatio="none"
          role="img"
        >
          <title>Agents concurrent over time</title>
          <path d={area} className="sf-carea" />
          <path d={top} className="sf-cline" />
        </svg>

        {at !== null && (
          <>
            <i className="sf-cursor" style={{ left: `${((at.bar + 0.5) / bars) * 100}%` }} />
            <div
              className="sf-tip"
              style={{
                left: `${Math.min(78, Math.max(22, at.fraction * 100))}%`,
              }}
            >
              <div className="sf-dim">
                {mdhm(fromMs + at.bar * footMs)} –{' '}
                {mdhm(Math.min(fromMs + (at.bar + 1) * footMs, nowMs))}
              </div>
              <div>
                <b>{counts[at.bar] ?? 0}</b> <span className="sf-dim">agents concurrent</span>
              </div>
            </div>
          </>
        )}
      </div>

      {/* 目盛りは Tokens と同じものを使う。2 枚は同じ `footMs` と同じ期間を見ている */}
      <TimeTicks fromMs={fromMs} toMs={nowMs} />
    </div>
  );
}
