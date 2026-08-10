import { scaleLinear } from 'd3-scale';
import { area, curveStepAfter, line } from 'd3-shape';
import type { IssueSummaryJson } from '~/interface/presenters/issues/issues.presenter.ts';
import { FLOW_BARS, FLOW_SPAN_MS, flowSeries } from '../../derive/issueFlow.ts';
import { TimeTicks } from '../primitives/TimeTicks.tsx';

/* 開いている件数の面と、閉じた件数の累計の線。

   **近似だと言い切って出す。** 台帳に状態遷移の履歴が無いので、閉じた時刻は最後に
   更新された時刻で代えている。増減の向きは読めるが、日ごとの正確な件数としては読めない。

   線の形は `curveStepAfter` で階段にする。**滑らかに繋がない** —— バー 1 本は
   半日ぶんの集計で、その間の値は 1 つも観測していない。曲線で結ぶと、観測していない
   途中の値を描いたことになる。

   目盛りの位置と刻みは `d3-scale` に任せる。手で 3 つ置くと、期間を変えたときに
   目盛りだけが期間に合わなくなる。 */

/** 描画座標の高さ。幅はバーの本数で決まる */
const HEIGHT = 64;

/** バー 1 本の幅 */
const BAR_WIDTH = 10;

/** 上に空ける余白。ここを詰めると、いちばん高い点が枠に貼り付いて読めない */
const TOP_PAD = 6;

const WIDTH = FLOW_BARS * BAR_WIDTH;

export function FlowChart({
  issues,
  nowMs,
}: {
  issues: readonly IssueSummaryJson[];
  nowMs: number;
}) {
  const { open, closed } = flowSeries(issues, nowMs);
  const fromMs = nowMs - FLOW_SPAN_MS;
  const openPeak = Math.max(1, ...open);
  const closedTotal = Math.max(1, closed[FLOW_BARS - 1] ?? 1);

  const x = scaleLinear().domain([0, FLOW_BARS]).range([0, WIDTH]);
  /* 面と線で高さの物差しを分ける。**同じ物差しに載せない** —— 開いている数と閉じた累計は
     単位が違うので、同じ軸に置くと「追い抜いた」という読めない絵になる。

     物差しが 2 つあるので、高さの目盛りは引かない。1 本の線がどちらの数を指しているのかが
     決まらず、引けば必ず片方について嘘になる。数そのものは凡例が持っている。 */
  const yOpen = scaleLinear()
    .domain([0, openPeak])
    .nice()
    .range([HEIGHT - 2, TOP_PAD]);
  const yClosed = scaleLinear()
    .domain([0, closedTotal])
    .nice()
    .range([HEIGHT - 2, TOP_PAD]);

  const openArea = area<number>()
    .x((_, index) => x(index))
    .y0(HEIGHT)
    .y1((value) => yOpen(value))
    .curve(curveStepAfter);
  const closedLine = line<number>()
    .x((_, index) => x(index))
    .y((value) => yClosed(value))
    .curve(curveStepAfter);

  const areaPath = openArea([...open]) ?? '';
  const linePath = closedLine([...closed]) ?? '';

  return (
    <div className="flow-chart">
      <svg
        className="sf-svg"
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        preserveAspectRatio="none"
        style={{ height: HEIGHT }}
        role="img"
      >
        <title>Open issues and closed issues, day by day</title>
        <path d={areaPath} className="fl-open" />
        <path d={linePath} className="fl-closed" />
      </svg>
      <TimeTicks fromMs={fromMs} toMs={nowMs} />
      <div className="flow-legend">
        <span className="lg">
          <i className="sf-dot" style={{ background: 'rgba(96, 165, 250, .65)' }} /> open now{' '}
          {open[FLOW_BARS - 1] ?? 0} (peak {openPeak})
        </span>
        <span className="lg">
          <i className="sf-dot" style={{ background: 'var(--active)' }} /> closed cumulative{' '}
          {closed[FLOW_BARS - 1] ?? 0}
        </span>
        <span className="dimtxt">last 30d</span>
      </div>
    </div>
  );
}
