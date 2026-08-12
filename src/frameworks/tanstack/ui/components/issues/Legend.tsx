import { mdiAlertOutline, mdiSourceBranch } from '@mdi/js';
import { ARROW, arrowPoints } from '../../derive/edgeShape.ts';
import type { EventLog } from '../../derive/issueEvents.ts';
import { edgeColorOf } from '../../derive/issueTree.ts';
import { Icon } from '../primitives/Icon.tsx';

/* 読み方の凡例。**画面の下に置く。**

   一覧でもグラフでも、線とチップの意味は同じところに在るべきである。上のツールバーへ混ぜると
   絞り込みの操作と読み方の説明が同じ列に並び、どちらも見つけにくくなる。 */

/** 線の見本。**本物と同じ矢じりを描く** —— 別に作ると、本物と違う形が説明として並ぶ */
export function EdgeSample({
  color,
  dashed = false,
}: {
  readonly color: string;
  readonly dashed?: boolean;
}) {
  const width = 24;
  return (
    <svg className="ln-svg" width={width} height={ARROW.half * 2} aria-hidden="true">
      <line
        x1={0}
        y1={ARROW.half}
        x2={width - ARROW.length}
        y2={ARROW.half}
        stroke={color}
        strokeWidth={1.6}
        strokeDasharray={dashed ? '4 4' : undefined}
      />
      <polygon points={arrowPoints(width, ARROW.half)} fill={color} />
    </svg>
  );
}

/* 一覧の読み方。行に出るものを全部並べる。

   **弧の矢じりは着手の順を指している。** 依存の向きをそのまま描くと矢は「何を待っているか」を
   指すが、読みたいのは取りかかる順である。 */
export function IssuesLegend({
  complete,
  events,
}: {
  readonly complete: boolean;
  readonly events: EventLog;
}) {
  return (
    <div className="legend-bar">
      <span>
        <span className="tree-mark">└</span> parent-child
      </span>
      <span>
        <EdgeSample color={edgeColorOf('blocks')} /> blocks — the arrow points at what comes later
      </span>
      <span>
        <EdgeSample color={edgeColorOf('')} /> other
      </span>
      <span>
        <b className="iunlock">+n</b> finishing it frees n issues
      </span>
      <span>
        <b className="brstate">
          <Icon path={mdiSourceBranch} size={10} />
          <b>↑n</b>
          <i>↓n</i>
        </b>{' '}
        its branch is n ahead and n behind the base
      </span>
      {/* 手元の git を読めていないブランチ。**読めなかったことにも見本が要る** —— `?` の意味が
          `title` の中にしか無いと、触れる人にしか読めない */}
      <span>
        <b className="brstate unread">
          <Icon path={mdiSourceBranch} size={10} />
          <b>?</b>
        </b>{' '}
        it has a branch, but the local git could not be read
      </span>
      <span>
        <b className="prchip open">#n</b> the pull request that closes it
      </span>
      <span>
        <b className="wk-dup">
          <Icon path={mdiAlertOutline} size={10} /> n concurrent
        </b>{' '}
        more than one agent is on it right now
      </span>
      {/* 右のトラックの読み方。**見本は本物と同じ class から採る** —— 別に作ると本物とずれる。

          点の形だけでなく、下地の 4 通りも並べる。**ハッチ・破線・何も無しの違いが、
          読んだか読めなかったかを言う唯一の目印である** —— これを載せないと、読み終えて
          何も起きていなかった行と、読めなかった行の見分け方がどこにも書いていないことになる。 */}
      <span className="lg-gt">
        <i className="gt-line" /> from the first instant observed to the last — never to now
      </span>
      <span className="lg-gt">
        <i className="gt-open" /> created
      </span>
      <span className="lg-gt">
        <i className="gt-ev" /> something happened
      </span>
      <span className="lg-gt">
        <i className="gt-ev many" /> more than one, too close to tell apart
      </span>
      <span className="lg-gt">
        <i className="gt-flag st-closed" /> closed
      </span>
      <span className="lg-gt">
        <i className="gt-flag st-closed approx" /> closed, the time taken from updated_at
      </span>
      <span className="lg-gt">
        <i className="gt-cut" /> read only back to here
      </span>
      <span className="lg-gt">
        <i className="gt unread" /> not read
      </span>
      <span className="lg-gt">
        <i className="gt reading" /> still reading
      </span>
      <span className="lg-gt">
        <i className="lg-gt-line guide" /> a milestone is due
      </span>
      {!complete && (
        <span className="dg-cut" title="Some blocking issues were not fetched">
          some dependencies were not fetched — arcs may be missing
        </span>
      )}
      {/* 全部を読めていないなら黙らない。**どこで読むのをやめたかは画面に出ている** ——
          読まなかった行はハッチが掛かるので、言うべきなのはその見分け方である */}
      {events.kind === 'observed' && !events.complete && !events.reading && (
        <span className="dg-cut">
          some issues were not read — those rows are hatched, not empty
        </span>
      )}
    </div>
  );
}
