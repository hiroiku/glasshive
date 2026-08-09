import { edgeColorOf } from '../../derive/issueTree.ts';

/* 課題の帯。探しと、状態の絞りと、線の読み方。

   **`#issues-list` の外に置く。** 一覧は 9 列の格子で、帯はその列とは関係が無い。
   中へ入れると帯が列に割り付けられて、探し口が 1 列ぶんの幅に潰れる。 */

/** 弧の色の読み方。親子だけは線ではなく罫線で表しているので、見本の形が違う */
const LEGEND: readonly (readonly [string, string])[] = [
  ['blocks', edgeColorOf('blocks')],
  ['other', edgeColorOf('')],
];

export interface IssuesToolbarProps {
  readonly query: string;
  readonly onQuery: (query: string) => void;
  /** 状態ごとの件数。閉じたものは別の札で出すので、ここには並べない */
  readonly counts: Readonly<Record<string, number>>;
  readonly status: string | null;
  readonly onStatus: (status: string | null) => void;
  readonly includeClosed: boolean;
  readonly onIncludeClosed: (include: boolean) => void;
  readonly flow: boolean;
  readonly onFlow: (flow: boolean) => void;
}

export function IssuesToolbar({
  query,
  onQuery,
  counts,
  status,
  onStatus,
  includeClosed,
  onIncludeClosed,
  flow,
  onFlow,
}: IssuesToolbarProps) {
  return (
    <div className="view-toolbar">
      <input
        className="search"
        type="search"
        placeholder="Search issues…"
        value={query}
        onChange={(event) => onQuery(event.target.value)}
      />
      {Object.entries(counts)
        .filter(([name]) => name !== 'closed')
        .map(([name, count]) => (
          <button
            key={name}
            type="button"
            className={`fchip ${status === name ? 'on' : ''}`}
            onClick={() => onStatus(status === name ? null : name)}
          >
            {name} {count}
          </button>
        ))}
      <button
        type="button"
        className={`fchip ${includeClosed ? 'on' : ''}`}
        onClick={() => onIncludeClosed(!includeClosed)}
      >
        + closed {counts.closed ?? 0}
      </button>
      <button
        type="button"
        className={`fchip ${flow ? 'on' : ''}`}
        title="開いている数の推移と、閉じた数の累計(作られた時刻と閉じた時刻から導いた近似)"
        onClick={() => onFlow(!flow)}
      >
        flow
      </button>
      <span className="legend">
        <span className="lg">
          <span className="tree-mark">└</span> parent-child
        </span>
        {LEGEND.map(([name, color]) => (
          <span key={name} className="lg">
            <svg width="18" height="8" aria-hidden="true">
              <line
                x1={1}
                y1={4}
                x2={17}
                y2={4}
                stroke={color}
                strokeWidth={1.5}
                strokeLinecap="round"
              />
            </svg>
            {name}
          </span>
        ))}
      </span>
    </div>
  );
}
