import type { IssueSummaryJson } from '~/interface/presenters/issues/issues.presenter.ts';
import { FLOW_BARS, flowSeries } from '../../derive/issueFlow.ts';

/* 開いている件数の面と、閉じた件数の累計の線。

   **近似だと言い切って出す。** 台帳に状態遷移の履歴が無いので、閉じた時刻は最後に
   更新された時刻で代えている。増減の向きは読めるが、日ごとの正確な件数としては読めない。 */

/** 描画座標の高さ。幅はバーの本数で決まる */
const HEIGHT = 64;

/** バー 1 本の幅 */
const BAR_WIDTH = 10;

export function FlowChart({
  issues,
  nowMs,
}: {
  issues: readonly IssueSummaryJson[];
  nowMs: number;
}) {
  const { open, closed } = flowSeries(issues, nowMs);
  const openPeak = Math.max(1, ...open);
  const closedTotal = Math.max(1, closed[FLOW_BARS - 1] ?? 1);

  let area = 'M 0 64 ';
  open.forEach((value, bar) => {
    const y = 62 - (value / openPeak) * 56;
    area += `L ${bar * BAR_WIDTH} ${y} L ${(bar + 1) * BAR_WIDTH} ${y} `;
  });
  area += `L ${FLOW_BARS * BAR_WIDTH} 64 Z`;

  const line = closed
    .map((value, bar) => `${bar * BAR_WIDTH + 5},${62 - (value / closedTotal) * 56}`)
    .join(' ');

  return (
    <div className="flow-chart">
      <svg
        className="sf-svg"
        viewBox={`0 0 ${FLOW_BARS * BAR_WIDTH} ${HEIGHT}`}
        preserveAspectRatio="none"
        style={{ height: HEIGHT }}
        role="img"
      >
        <title>Open issues and closed issues, day by day</title>
        <path d={area} className="fl-open" />
        <polyline points={line} className="fl-closed" />
      </svg>
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
