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

/** まだ読んでいない欄。**空欄にしない** — 空欄は「0 だった」と読める */
const DASH = '—';
const NOT_READ = 'Not read yet';

/** 期間を絞っていないときに稼働のトラックが覆う幅。稼働が 1 つも無いときの目盛りとして使う */
const DEFAULT_STRIP_MS = 30 * 86_400_000;

/* 数の欄ひとつ。読む前は `—`、読んだ後は 0 を空欄にする。

   0 を空欄にしてよいのは、それが「読んで、0 だった」ときだけである。 */
function Count({ value, read }: { value: number | null; read: boolean }) {
  if (!read) {
    return (
      <span className="right mono dimtxt" title={NOT_READ}>
        {DASH}
      </span>
    );
  }
  return <span className="right mono">{value || ''}</span>;
}

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

/* プロジェクト 1 つぶんの稼働をトラック 1 本に描く。**全エージェントの和集合である。**

   誰が何本動いていたかは左の欄が数で言う。ここで読ませたいのは「このプロジェクトは、
   この期間のどこで動いていたか」で、行をまたいで同じ軸に載っているから比べられる。

   全部を見られていないときは黙らない。途切れた絵をそのまま出すと、
   読めなかった時間が「静かだった時間」として並ぶ。 */
function ActivityStrip({ row, fromMs, toMs }: { row: OverviewRow; fromMs: number; toMs: number }) {
  const width = Math.max(1, toMs - fromMs);
  if (!row.read) {
    return <span className="dash-act" title={NOT_READ} />;
  }
  const shown = row.spans.filter((span) => span[1] >= fromMs && span[0] <= toMs);
  return (
    <span
      className={`dash-act${row.spansComplete ? '' : ' cut'}`}
      title={
        row.spansComplete
          ? `${shown.length} ${shown.length === 1 ? 'run' : 'runs'} in view`
          : 'Some activity could not be read — the gaps may not be quiet'
      }
    >
      {shown.map((span) => {
        const left = ((Math.max(span[0], fromMs) - fromMs) / width) * 100;
        const size = ((Math.min(span[1], toMs) - Math.max(span[0], fromMs)) / width) * 100;
        return (
          <i
            key={`${span[0]}-${span[1]}`}
            style={{ left: `${left}%`, width: `${Math.max(size, MIN_MARK)}%` }}
          />
        );
      })}
    </span>
  );
}

/** 稼働 1 つを描く最小の幅。これより細いと、短い稼働が絵から消える */
const MIN_MARK = 0.6;

export interface OverviewTableProps {
  readonly rows: readonly OverviewRow[];
  readonly order: SortOrder;
  readonly onSort: (key: SortKey) => void;
  readonly pinned: ReadonlySet<string>;
  readonly onTogglePin: (id: string) => void;
  /** 今の時刻。外から渡すのは、全ての行で同じ基準にするためである */
  readonly nowMs: number;
  /** 稼働のトラックが覆う時間の幅。`null` は「観測できた分だけ」 */
  readonly spanMs: number | null;
}

export function OverviewTable({
  rows,
  order,
  onSort,
  pinned,
  onTogglePin,
  nowMs,
  spanMs,
}: OverviewTableProps) {
  const ceiling = tokensCeiling(rows);

  /* 稼働のトラックの軸は、行をまたいで 1 つである。**行ごとに合わせない** —
     行ごとに合わせると、5 分だけ動いたプロジェクトと 3 日動いたプロジェクトが
     同じ長さのトラックになって、並べて見る意味が無くなる。 */
  const oldest = rows.reduce<number | null>((found, row) => {
    const first = row.spans[0]?.[0];
    if (first === undefined) return found;
    return found === null || first < found ? first : found;
  }, null);
  const fromMs = spanMs === null ? (oldest ?? nowMs - DEFAULT_STRIP_MS) : nowMs - spanMs;

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
        <span>Activity</span>
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

            {/* 読む前の欄は空にしない。**空欄は「0 だった」と読める。**
                読んでいないことは、`—` で「ここにはまだ何も無い」と言う。 */}
            <Count value={row.active} read={row.read} />
            <Count value={row.waiting} read={row.read} />
            <span
              className={`right mono${(row.input ?? 0) > 0 ? ' inputc' : ''}`}
              title={row.read ? undefined : NOT_READ}
            >
              {row.read ? row.input || '' : DASH}
            </span>

            {/* 観測できなかった消費は空にせず、観測できなかったと言う。
                空にすると「使っていない」と並んで見えてしまう。 */}
            <span
              className={`right mono${row.read ? '' : ' dimtxt'}`}
              title={
                row.read
                  ? row.tokens24hState === 'unobservable'
                    ? 'Could not be read'
                    : undefined
                  : NOT_READ
              }
            >
              {!row.read
                ? DASH
                : row.tokens24hState === 'unobservable'
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

            <ActivityStrip row={row} fromMs={fromMs} toMs={nowMs} />

            <span className="right dimtxt" title={row.read ? undefined : NOT_READ}>
              {!row.read
                ? DASH
                : row.lastActivityMs === null
                  ? ''
                  : formatSince(row.lastActivityMs, nowMs)}
            </span>
          </div>
        );
      })}
    </div>
  );
}
