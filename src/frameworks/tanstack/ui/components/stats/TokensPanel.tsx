import { scaleLinear } from 'd3-scale';
import { curveStepAfter, line } from 'd3-shape';
import { type TimeWindow, WINDOWS } from '../../derive/timeWindow.ts';
import { type Bin, footLabel, rangeLabel } from '../../derive/usage.ts';
import { formatTokens, mdhm } from '../../format.ts';
import { useChartHover } from '../../hooks/useChartHover.ts';
import { TimeTicks } from '../primitives/TimeTicks.tsx';

/* 消費の推移と、その積み上がり。

   選ぶのは一度に見る幅だけで、選択肢はウォーターフォールと同じである。足(ローソク足 1 本の
   長さ)は幅から決まるので、いま何本 × 何分を見ているかは見出しの右に出す。

   目盛りの位置は `d3-scale` が決める。**両端と真ん中の 3 つを手で置かない** —— 幅を
   30 分から 7 日まで動かすので、置き場所を固定すると、どの幅でも中途半端な時刻が並ぶ。

   積み上がりの線は `curveStepAfter` で階段にする。足 1 本ぶんの間の値は観測していない。 */

export interface TokensPanelProps {
  readonly bins: readonly Bin[];
  readonly fromMs: number;
  readonly footMs: number;
  readonly bars: number;
  /** 選ばれている幅。`auto` なら実際に在るものに合わせてある */
  readonly window: TimeWindow;
  readonly nowMs: number;
  readonly onWindow: (window: TimeWindow) => void;
}

export function TokensPanel({
  bins,
  fromMs,
  footMs,
  bars,
  window,
  nowMs,
  onWindow,
}: TokensPanelProps) {
  const hover = useChartHover(bars);
  const heights = bins.map((bin) => bin.total);
  const total = heights.reduce((sum, value) => sum + value, 0);
  const ceiling = Math.max(1, ...heights);

  let running = 0;
  const cumulative = heights.map((value) => (running += value));

  const y = scaleLinear().domain([0, ceiling]).range([56, 4]);
  const yTotal = scaleLinear()
    .domain([0, Math.max(1, total)])
    .range([55, 5]);
  const stack = line<number>()
    .x((_, index) => index * 10 + 5)
    .y((value) => yTotal(value))
    .curve(curveStepAfter);
  /* バーごとの位置と高さを先に組む。**React のキーに添字を使わない** —
     バーの並びは期間を動かすたびに丸ごと入れ替わるので、添字では別のバーと取り違える。 */
  const columns = bins.map((bin, index) => ({
    at: fromMs + index * footMs,
    x: index * 10,
    total: bin.total,
  }));
  const at = hover.at;
  const bin = at === null ? undefined : bins[at.bar];

  return (
    <div className="sf-panel sf-chart">
      <div className="sf-h">
        <span className="sf-title">Tokens</span>
        {WINDOWS.map((preset) => (
          <button
            key={preset.label}
            type="button"
            className={window === preset.key ? 'fchip on' : 'fchip'}
            title={preset.title}
            onClick={() => onWindow(preset.key)}
          >
            {preset.label}
          </button>
        ))}
        <span className="sf-dim">
          {footLabel(footMs)} × {bars} = {rangeLabel(footMs * bars)}
        </span>
        <span className="sf-big" title="input + output + cache write">
          {formatTokens(total)}
        </span>
      </div>

      {/* ホバーすると、そのバー 1 本ぶんの消費をツールチップに出す。グラフ自体の要旨は
          svg の `title` が持っているので、ホバーできない人にも届く */}
      {/* biome-ignore lint/a11y/noStaticElementInteractions: ホバーして読むためだけの面 */}
      <div className="sf-plot" onMouseMove={hover.onMouseMove} onMouseLeave={hover.onMouseLeave}>
        <svg
          className="sf-svg"
          viewBox={`0 0 ${bars * 10} 56`}
          preserveAspectRatio="none"
          role="img"
        >
          <title>Tokens over time</title>
          {columns.map((column) =>
            column.total > 0 ? (
              <rect
                key={column.at}
                x={column.x + 1}
                width={8}
                y={y(column.total)}
                height={56 - y(column.total)}
                className="sf-bar"
              />
            ) : null,
          )}
          {total > 0 && <path className="sf-line" d={stack([...cumulative]) ?? ''} />}
        </svg>

        {at !== null && bin !== undefined && (
          <>
            <i className="sf-cursor" style={{ left: `${((at.bar + 0.5) / bars) * 100}%` }} />
            <div
              className="sf-tip"
              style={{
                left: `${Math.min(82, Math.max(18, at.fraction * 100))}%`,
              }}
            >
              <div className="sf-dim">
                {mdhm(fromMs + at.bar * footMs)} –{' '}
                {mdhm(Math.min(fromMs + (at.bar + 1) * footMs, nowMs))}
              </div>
              <div>
                <b>{formatTokens(bin.total)}</b>{' '}
                <span className="sf-dim">
                  in {formatTokens(bin.input)} · out {formatTokens(bin.output)} · cacheW{' '}
                  {formatTokens(bin.cacheWrite)}
                </span>
              </div>
              <div className="sf-dim">cumulative {formatTokens(cumulative[at.bar] ?? 0)}</div>
            </div>
          </>
        )}
      </div>

      <TimeTicks fromMs={fromMs} toMs={nowMs} />
    </div>
  );
}
