import { mdhm } from '../../format.ts';
import { useChartHover } from '../../hooks/useChartHover.ts';

/* 同時に動いていたエージェントの数。

   階段状の面で描くのは、**この数が整数だから**である。滑らかに繋ぐと、
   3 と 4 の間に「3.5 エージェント」の時間が在ったように見える。 */

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

  const yOf = (value: number) => 55 - (value / ceiling) * 50;
  const top = counts
    .flatMap((value, index) => [`${index * 10},${yOf(value)}`, `${(index + 1) * 10},${yOf(value)}`])
    .join(' ');
  const area = `M 0 56 ${counts
    .map((value, index) => `L ${index * 10} ${yOf(value)} L ${(index + 1) * 10} ${yOf(value)}`)
    .join(' ')} L ${bars * 10} 56 Z`;

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
          <polyline points={top} className="sf-cline" />
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

      {/* 目盛りは Tokens と同じ表記で揃える。2 枚は同じ `footMs` と同じ期間を見ている */}
      <div className="sf-ticks">
        <span>{mdhm(fromMs)}</span>
        <span>{mdhm(fromMs + (nowMs - fromMs) / 2)}</span>
        <span>{mdhm(nowMs)}</span>
      </div>
    </div>
  );
}
