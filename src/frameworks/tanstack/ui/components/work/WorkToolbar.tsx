import type React from 'react';
import { GANTT_WINDOWS, type GanttWindow } from '../../derive/issueGantt.ts';
import type { WorkUnit } from '../../nav/search.ts';
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
      {/* タイムラインの幅は、そのタイムラインが在るときだけ選ばせる。**ブランチにも
          マイルストーンにも依存グラフにも時間軸は無い** —— 押しても何も動かないチップが
          並ぶと、効かない操作を覚えることになる */}
      {unit === null && !graph && (
        <span className="scale-chips">
          {GANTT_WINDOWS.map((preset) => (
            <button
              key={preset.label}
              type="button"
              className={`fchip ${gantt === preset.key ? 'on' : ''}`}
              title={preset.title}
              onClick={() => onGantt(preset.key)}
            >
              {preset.label}
            </button>
          ))}
        </span>
      )}
      {/* 読み方の凡例はここに出さない。**凡例は画面の下** —— 一覧もグラフも同じ場所に在る */}
      <LayoutSwitch graph={graph} onGraph={onGraph} />
    </div>
  );
}
