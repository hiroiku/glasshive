import { scaleLinear } from 'd3-scale';
import { area as areaOf, curveStepAfter, line as lineOf } from 'd3-shape';
import { mdhm } from '../../format.ts';
import { useChartHover } from '../../hooks/useChartHover.ts';
import { TimeTicks } from '../primitives/TimeTicks.tsx';
import {
  isObserved,
  observationMark,
  observationTitle,
  StatsNote,
  type StatsObservation,
} from './StatsObservation.tsx';

/* 同時に動いていたエージェントの数。

   階段状の面で描くのは、**この数が整数だから**である。滑らかに繋ぐと、
   3 と 4 の間に「3.5 エージェント」の時間が在ったように見える。`d3-shape` の
   `curveStepAfter` がその階段そのもので、高さの物差しは `d3-scale` が持つ。

   稼働を観測できなかったエージェントは、読めた階段の上に別の面として積む。
   **同じ高さに足さない。** 足せば読めなかったことが動いていたことになり、落とせば
   静かだったことになる。積み分けて初めて、読めた数と分からない数が同時に読める。 */

export interface ConcurrencyPanelProps {
  readonly counts: readonly number[];
  /** 稼働を観測できなかったエージェントの数。足ごとに `counts` とは別に数えたもの */
  readonly unknown: readonly number[];
  readonly fromMs: number;
  readonly footMs: number;
  readonly bars: number;
  readonly nowMs: number;
  /** いま動いているエージェントの数。グラフとは別に、今この瞬間を出す */
  readonly liveNow: number;
  /* 数え上げられなかったエージェントが居るか。子のディレクトリを走査できなかったセッションが
     在ると、そこに何人居たのかは分からないので、数えられた高さは下限でしかない。 */
  readonly uncounted: boolean;
  /* 稼働区間の素材そのものをどこまで受け取れたか。読み終える前は階段を描かない。
     読めなかったエージェントは `unknown` が運ぶので、ここは全体の話だけを持つ。 */
  readonly observation: StatsObservation;
}

export function ConcurrencyPanel({
  counts,
  unknown,
  fromMs,
  footMs,
  bars,
  nowMs,
  liveNow,
  uncounted,
  observation,
}: ConcurrencyPanelProps) {
  const hover = useChartHover(bars);
  const read = isObserved(observation);
  const peak = Math.max(0, ...counts);
  const unknownPeak = Math.max(0, ...unknown);
  // 面は階段の上に積むので、天井は両方を足した高さで取る
  const stacked = counts.map((value, index) => value + (unknown[index] ?? 0));
  const ceiling = Math.max(1, ...stacked);

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
  // 分からない数の面は、読めた数の上端から積んだ高さまで
  const unknownArea = areaOf<number>()
    .x((_, index) => x(index))
    .y0((_, index) => y(counts[index] ?? 0))
    .y1((value) => y(value))
    .curve(curveStepAfter);
  const area = stepArea([...counts]) ?? '';
  const top = stepLine([...counts]) ?? '';
  const band = unknownPeak > 0 ? (unknownArea(stacked) ?? '') : '';
  const peakTitle = uncounted
    ? 'At least this many — subagents in some sessions could not be counted'
    : 'Peak agents concurrent in range';
  /* グラフそのものの説明。ホバーできない人にも、積んだ面が何かと、数が下限でしかないことを届ける */
  const chartTitle = [
    'Agents concurrent over time',
    ...(unknownPeak > 0
      ? ['the dashed band on top is agents whose activity could not be read']
      : []),
    ...(uncounted
      ? ['subagents in some sessions could not be counted, so the counts are a lower bound']
      : []),
  ].join(' — ');

  const at = hover.at;

  return (
    <div className="sf-panel sf-conc">
      {/* `peak` が数えるのは、稼働区間を読めたエージェントだけである。**読めなかった数を
          その中に混ぜない** —— 混ぜれば読めなかったことが動いていたことになり、落とせば
          静かだったことになる。読めなかった数は隣に別の数として並べるので、0 がひとりで
          「誰も動いていなかった」と名乗ることは無い。

          `now` は稼働区間ではなくセッションの状態から来るので、稼働区間を読めなくても言える。
          読み終える前だけ伏せる。

          子を数え上げられなかったセッションが在るときは、`peak` に `+` を添えて下限だと言う。
          **何人居たのかは分からないので、数そのものは動かさない。** */}
      <div className="sf-h">
        <span className="sf-title">Agents</span>
        <span
          className="sf-dim"
          title={observation.kind === 'pending' ? observationTitle(observation) : undefined}
        >
          now {observation.kind === 'pending' ? observationMark(observation) : liveNow}
        </span>
        <span className="sf-big" title={read ? peakTitle : observationTitle(observation)}>
          peak {read ? `${peak}${uncounted ? '+' : ''}` : observationMark(observation)}
        </span>
        {/* 山の高さの脇に、読めなかったエージェントの数を添える。数を足して 1 つにすると、
            読めなかった分まで動いていたと言うことになる */}
        {read && unknownPeak > 0 && (
          <span className="sf-unk" title="Agents whose activity could not be read">
            +{unknownPeak} unknown
          </span>
        )}
      </div>

      {/* ホバーすると、そのバー 1 本ぶんの同時数をツールチップに出す。グラフ自体の要旨は
          svg の `title` が持っているので、ホバーできない人にも届く。
          観測できていないときはホバーする対象そのものが無いので、受け取りもしない */}
      {/* biome-ignore lint/a11y/noStaticElementInteractions: ホバーして読むためだけの面 */}
      <div
        className="sf-plot"
        onMouseMove={read ? hover.onMouseMove : undefined}
        onMouseLeave={read ? hover.onMouseLeave : undefined}
      >
        {read ? (
          <svg
            className="sf-svg"
            viewBox={`0 0 ${bars * 10} 56`}
            preserveAspectRatio="none"
            role="img"
          >
            <title>{chartTitle}</title>
            <path d={area} className="sf-carea" />
            <path d={top} className="sf-cline" />
            {unknownPeak > 0 && <path d={band} className="sf-uarea" />}
          </svg>
        ) : (
          <StatsNote observation={observation} className="sf-blank" />
        )}

        {read && at !== null && (
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
              {/* 1 本ぶんの数も、数え上げられなかった子が居るなら下限でしかない */}
              <div>
                <b>{`${counts[at.bar] ?? 0}${uncounted ? '+' : ''}`}</b>{' '}
                <span className="sf-dim">agents concurrent</span>
              </div>
              {(unknown[at.bar] ?? 0) > 0 && (
                <div className="sf-dim">+{unknown[at.bar]} could not be read</div>
              )}
            </div>
          </>
        )}
      </div>

      {/* 目盛りは Tokens と同じものを使う。2 枚は同じ `footMs` と同じ期間を見ている */}
      <TimeTicks fromMs={fromMs} toMs={nowMs} />
    </div>
  );
}
