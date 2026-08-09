import { type Bin, FEET, MAX_BARS, rangeLabel, WINDOW_MS } from '../../derive/usage.ts';
import { absTime, formatTokens, mdhm } from '../../format.ts';
import { useChartHover } from '../../hooks/useChartHover.ts';

/* 消費の山と、その積み上がり。

   足の長さを選ばせるのはローソク足と同じ語彙である。範囲ではなく 1 本の長さを選ぶと、
   「いま何を見ているか」が本数 × 長さで読める。 */

export interface TokensPanelProps {
  readonly bins: readonly Bin[];
  readonly fromMs: number;
  readonly footMs: number;
  readonly bars: number;
  readonly nowMs: number;
  readonly onFoot: (footMs: number) => void;
}

export function TokensPanel({ bins, fromMs, footMs, bars, nowMs, onFoot }: TokensPanelProps) {
  const hover = useChartHover(bars);
  const heights = bins.map((bin) => bin.total);
  const total = heights.reduce((sum, value) => sum + value, 0);
  const ceiling = Math.max(1, ...heights);

  let running = 0;
  const cumulative = heights.map((value) => (running += value));
  /* 足ごとの位置と高さを先に組む。**鍵に添字を使わない** —
     足の並びは窓を動かすたびに丸ごと入れ替わるので、添字では別の足と取り違える。 */
  const columns = bins.map((bin, index) => ({
    at: fromMs + index * footMs,
    x: index * 10,
    total: bin.total,
  }));
  const rangeMs = nowMs - fromMs;
  const at = hover.at;
  const bin = at === null ? undefined : bins[at.bar];

  return (
    <div className="sf-panel sf-chart">
      <div className="sf-h">
        <span className="sf-title">Tokens</span>
        {FEET.map((foot) => (
          <button
            key={foot.label}
            type="button"
            className={`fchip ${footMs === foot.key ? 'on' : ''}`}
            title={`1 本 = ${foot.label}(窓 ${rangeLabel(Math.min(WINDOW_MS, foot.key * MAX_BARS))})`}
            onClick={() => onFoot(foot.key)}
          >
            {foot.label}
          </button>
        ))}
        <span className="sf-dim">
          × {bars} = {rangeLabel(rangeMs)}
        </span>
        <span className="sf-big" title="input + output + cache write">
          {formatTokens(total)}
        </span>
      </div>

      {/* 載せると、その柱ひとつぶんの消費を読み上げ欄に出す。図そのものの言い分は
          svg の題が持っているので、載せられない人にも要旨は届く */}
      {/* biome-ignore lint/a11y/noStaticElementInteractions: 載せて読むためだけの面 */}
      <div className="sf-plot" onMouseMove={hover.onMouseMove} onMouseLeave={hover.onMouseLeave}>
        <svg
          className="sf-svg"
          viewBox={`0 0 ${bars * 10} 56`}
          preserveAspectRatio="none"
          role="img"
        >
          <title>時間ごとの消費</title>
          {columns.map((column) =>
            column.total > 0 ? (
              <rect
                key={column.at}
                x={column.x + 1}
                width={8}
                y={56 - (column.total / ceiling) * 52}
                height={(column.total / ceiling) * 52}
                className="sf-bar"
              />
            ) : null,
          )}
          {total > 0 && (
            <polyline
              className="sf-line"
              points={cumulative
                .map((value, index) => `${index * 10 + 5},${55 - (value / total) * 50}`)
                .join(' ')}
            />
          )}
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

      <div className="sf-ticks">
        <span>{absTime(fromMs)}</span>
        <span>{absTime(fromMs + rangeMs / 2)}</span>
        <span>{absTime(nowMs)}</span>
      </div>
    </div>
  );
}
