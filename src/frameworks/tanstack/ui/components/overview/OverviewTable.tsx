import { Link } from '@tanstack/react-router';
import {
  dotStateOf,
  type OverviewRow,
  type SortKey,
  type SortOrder,
  tokensCeiling,
} from '../../derive/overview.ts';
import { formatSince, formatTokens } from '../../format.ts';
import { Dot } from '../primitives/Dot.tsx';

/* プロジェクトの一覧。

   `subgrid` で組む都合上、**行を包む要素を増やさない。** 見出しも行も
   `.dash-grid` の直接の子で、列は親が 1 か所で決めている。 */

interface HeadProps {
  readonly label: string;
  readonly sortKey: SortKey;
  readonly order: SortOrder;
  readonly onSort: (key: SortKey) => void;
  readonly right?: boolean;
}

/* 並べ替えの見出し。**3 つの画面で同じ class 名を使う** — `.head .sortable` の CSS が
   そのまま効くので、画面ごとに矢印の出し方を書き直さずに済む。 */
function SortHead({ label, sortKey, order, onSort, right }: HeadProps) {
  const on = order.key === sortKey;
  const className = [
    'sortable',
    right === true ? 'right' : '',
    on ? 'sorted' : '',
    on && order.direction === 'desc' ? 'desc' : '',
  ]
    .filter(Boolean)
    .join(' ');
  return (
    <button type="button" className={className} onClick={() => onSort(sortKey)}>
      {label}
    </button>
  );
}

export interface OverviewTableProps {
  readonly rows: readonly OverviewRow[];
  readonly order: SortOrder;
  readonly onSort: (key: SortKey) => void;
  readonly pinned: ReadonlySet<string>;
  readonly onTogglePin: (id: string) => void;
  /** 今の時刻。外から渡すのは、全ての行で同じ基準にするためである */
  readonly nowMs: number;
}

export function OverviewTable({
  rows,
  order,
  onSort,
  pinned,
  onTogglePin,
  nowMs,
}: OverviewTableProps) {
  const ceiling = tokensCeiling(rows);

  return (
    <div className="dash-grid">
      <div className="dash-row head">
        <span className="pin-col" />
        <SortHead label="Project" sortKey="name" order={order} onSort={onSort} />
        <SortHead label="Active" sortKey="active" order={order} onSort={onSort} right />
        <SortHead label="Waiting" sortKey="waiting" order={order} onSort={onSort} right />
        <SortHead label="Input" sortKey="input" order={order} onSort={onSort} right />
        <SortHead label="Tokens 24h" sortKey="tokens" order={order} onSort={onSort} right />
        <span>Share</span>
        <SortHead label="Last activity" sortKey="last" order={order} onSort={onSort} right />
      </div>

      {rows.map((row) => {
        const isPinned = pinned.has(row.id);
        return (
          <div key={row.id} className="dash-row">
            {/* 行の属性としてのピン留め。行を開く操作とは別のクリック対象にしたいので、
                リンクの外に出して独立した button にしてある。 */}
            <button
              type="button"
              className={`pin${isPinned ? ' on' : ''}`}
              aria-pressed={isPinned}
              aria-label={isPinned ? `Unpin ${row.name}` : `Pin ${row.name}`}
              onClick={() => onTogglePin(row.id)}
            >
              <i />
            </button>

            <Link
              to="/projects/$slug"
              params={{ slug: row.id }}
              className="dash-name"
              title={row.path ?? row.id}
            >
              <Dot state={dotStateOf(row)} />
              {row.name}
              {row.parent !== null && <span className="dimtxt"> {row.parent}</span>}
            </Link>

            <span className="right mono">{row.active || ''}</span>
            <span className="right mono">{row.waiting || ''}</span>
            <span className={`right mono${row.input > 0 ? ' inputc' : ''}`}>{row.input || ''}</span>

            {/* 観測できなかった消費は空にせず、観測できなかったと言う。
                空にすると「使っていない」と並んで見えてしまう。 */}
            <span
              className="right mono"
              title={row.tokens24hState === 'unobservable' ? 'Could not be read' : undefined}
            >
              {row.tokens24hState === 'unobservable'
                ? '?'
                : row.tokens24h !== null && row.tokens24h > 0
                  ? formatTokens(row.tokens24h)
                  : ''}
            </span>

            <span className="dash-bar">
              {row.tokens24h !== null && row.tokens24h > 0 && (
                <i style={{ width: `${(row.tokens24h / ceiling) * 100}%` }} />
              )}
            </span>

            <span className="right dimtxt">
              {row.lastActivityMs === null ? '' : formatSince(row.lastActivityMs, nowMs)}
            </span>
          </div>
        );
      })}
    </div>
  );
}
