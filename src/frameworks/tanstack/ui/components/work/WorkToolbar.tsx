import type React from 'react';
import type { WorkUnit } from '../../nav/search.ts';
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
      <input
        className="search"
        type="search"
        placeholder="Search issues…"
        value={query}
        onChange={(event) => onQuery(event.target.value)}
      />
      {children}
      {/* 読み方の凡例はここに出さない。**凡例は画面の下** —— 一覧もグラフも同じ場所に在る */}
      <LayoutSwitch graph={graph} onGraph={onGraph} />
    </div>
  );
}
