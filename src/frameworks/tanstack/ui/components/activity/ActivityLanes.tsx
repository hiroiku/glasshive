import type {
  ProjectJson,
  SessionJson,
  SubagentJson,
} from '~/interface/presenters/sessions/tree.presenter.ts';
import { absTime } from '../../format.ts';
import { intervalsOf, type TimelineNode } from '../../timeline/axis.ts';
import { AgentChip } from '../chips/Chips.tsx';

/* 窓の中の、細い活動の帯。誰がいつ関わったか。

   表の帯と同じ導出を使う — 正本に打たれた時刻の塊が稼働の区間である。同じ導出を使うので、
   表で見た帯と窓で見た帯が食い違わない。

   **軸はこの何人かだけで決める。** 表の軸を持ち込むと、1 件の課題に関わった数人の帯が
   画面の端の一筋に潰れる。 */

export interface ActivityRow {
  readonly file: string;
  readonly state: string;
  readonly label: string;
  readonly where: string;
  readonly node: SessionJson | SubagentJson;
}

/** 正本の在り処から、いまの盤面のセッション / 子を引き当てる */
export function resolveActivityRows(
  project: ProjectJson | undefined,
  refs: readonly { file: string; state: string; label: string; where: string }[],
): ActivityRow[] {
  const rows: ActivityRow[] = [];
  for (const ref of refs) {
    for (const session of project?.sessions ?? []) {
      if (session.file === ref.file) {
        rows.push({ ...ref, node: session });
        break;
      }
      const subagent = session.subagents.find((child) => child.file === ref.file);
      if (subagent !== undefined) {
        rows.push({ ...ref, node: subagent });
        break;
      }
    }
  }
  return rows;
}

export function ActivityLanes({ rows, nowMs }: { rows: readonly ActivityRow[]; nowMs: number }) {
  const lanes = rows
    .map((row) => ({ ...row, intervals: intervalsOf(row.node as TimelineNode, nowMs) }))
    .filter((row) => row.intervals.length > 0)
    // 関わりの早い順 = 話の順
    .sort((a, b) => (a.intervals[0]?.[0] ?? 0) - (b.intervals[0]?.[0] ?? 0));
  if (lanes.length === 0) return null;

  let t0 = Number.POSITIVE_INFINITY;
  let t1 = 0;
  for (const lane of lanes) {
    for (const [from, to] of lane.intervals) {
      if (from < t0) t0 = from;
      if (to > t1) t1 = to;
    }
  }
  // 一瞬で終わった関わりでも、線として見えるだけの幅を持たせる
  if (!(t1 > t0)) t1 = t0 + 60_000;
  const pct = (at: number) => ((at - t0) / (t1 - t0)) * 100;

  return (
    <div className="alanes">
      {lanes.map((lane) => (
        <div key={lane.file} className="alane">
          <AgentChip file={lane.file} state={lane.state} label={lane.label} where={lane.where} />
          <span className="alane-tl">
            {lane.intervals.map(([from, to], index) => (
              <i
                key={`${from}:${to}`}
                className={`bar ${lane.state === 'active' && index === lane.intervals.length - 1 ? 'active' : 'done'}`}
                title={`${absTime(from)} → ${absTime(to)}`}
                style={{ left: `${pct(from)}%`, width: `${Math.max(0.8, pct(to) - pct(from))}%` }}
              />
            ))}
          </span>
        </div>
      ))}
      <div className="alane-axis">
        <span>{absTime(t0)}</span>
        <span>{absTime(t1)}</span>
      </div>
    </div>
  );
}
