import type React from 'react';
import { GANTT_WINDOWS, type GanttWindow } from '../../derive/issueGantt.ts';
import type { IssueGroup, WorkUnit } from '../../nav/search.ts';
import { SearchInput } from '../primitives/SearchInput.tsx';
import { LayoutSwitch, UnitSwitch } from './UnitSwitch.tsx';

/* 課題を見ているときのツールバー。

   **`#issues-list` の外に置く。** 一覧はグリッドで、ツールバーはその列とは関係が無い。
   中へ入れるとツールバーが列に割り付けられて、検索欄が 1 列ぶんの幅に潰れる。 */

export interface WorkToolbarProps {
  readonly unit: WorkUnit | null;
  readonly onUnit: (unit: WorkUnit | null) => void;
  readonly issueCount: number;
  readonly branchCount: number;
  readonly milestoneCount: number;
  readonly graph: boolean;
  readonly onGraph: (graph: boolean) => void;
  /** 一覧の右のタイムラインが一度に見せる幅 */
  readonly gantt: GanttWindow;
  readonly onGantt: (gantt: GanttWindow) => void;
  /** 一覧の束ね方。`null` は束ねない */
  readonly group: IssueGroup | null;
  readonly onGroup: (group: IssueGroup | null) => void;
  readonly query: string;
  readonly onQuery: (query: string) => void;
  /** 絞り込みのチップ。中身は呼ぶ側が決める */
  readonly children?: React.ReactNode | undefined;
}

export function WorkToolbar({
  unit,
  onUnit,
  issueCount,
  branchCount,
  milestoneCount,
  graph,
  onGraph,
  gantt,
  onGantt,
  group,
  onGroup,
  query,
  onQuery,
  children,
}: WorkToolbarProps) {
  return (
    <div className="view-toolbar">
      <UnitSwitch
        unit={unit}
        onUnit={onUnit}
        issueCount={issueCount}
        branchCount={branchCount}
        milestoneCount={milestoneCount}
      />
      <SearchInput value={query} onChange={onQuery} placeholder="Search issues…" />
      {children}
      {/* 束ね方も、束ねる一覧が在るときだけ選ばせる。ブランチにもマイルストーンにも
          依存グラフにも、束ね直す行は無い */}
      {unit === null && !graph && (
        <span className="scale-chips">
          <span className="chip-label">Group</span>
          <button
            type="button"
            className={`fchip ${group === null ? 'on' : ''}`}
            /* 押されているかは色でしか出ていない。読み上げにも同じことを言わせる */
            aria-pressed={group === null}
            title="Leave the issues nested under their parents"
            onClick={() => onGroup(null)}
          >
            None
          </button>
          <button
            type="button"
            className={`fchip ${group === 'milestone' ? 'on' : ''}`}
            aria-pressed={group === 'milestone'}
            title="Gather the issues under the milestone each one is in"
            onClick={() => onGroup('milestone')}
          >
            Milestone
          </button>
        </span>
      )}
      {/* タイムラインの幅は、そのタイムラインが在るときだけ選ばせる。**ブランチにも依存グラフにも
          時間軸は無い** —— 押しても何も動かないチップが並ぶと、効かない操作を覚えることになる。
          マイルストーンの一覧は自分でこのチップを出すので、ここには出さない */}
      {unit === null && !graph && <SpanChips gantt={gantt} onGantt={onGantt} />}
      {/* 読み方の凡例はここに出さない。**凡例は画面の下** —— 一覧もグラフも同じ場所に在る */}
      <LayoutSwitch graph={graph} onGraph={onGraph} />
    </div>
  );
}

/* タイムラインの幅を選ぶチップ。**課題の一覧とマイルストーンの一覧が同じものを使う** ——
   2 つの表は同じ軸の上に在るので、幅の選び方まで別にすると、行き来した人が別の並びを覚える。 */
export function SpanChips({
  gantt,
  onGantt,
}: {
  gantt: GanttWindow;
  onGantt: (gantt: GanttWindow) => void;
}) {
  return (
    <span className="scale-chips">
      {/* 束ね方のチップと隣り合うので、どちらの並びかを言う */}
      <span className="chip-label">Span</span>
      {GANTT_WINDOWS.map((preset) => (
        <button
          key={preset.label}
          type="button"
          className={`fchip ${gantt === preset.key ? 'on' : ''}`}
          aria-pressed={gantt === preset.key}
          title={preset.title}
          onClick={() => onGantt(preset.key)}
        >
          {preset.label}
        </button>
      ))}
    </span>
  );
}
