/* biome-ignore-all lint/a11y/useSemanticElements: subgrid で列を揃えるので table の要素を置けない */
/* biome-ignore-all lint/a11y/useFocusableInteractive: セルは止まる場所ではない。タブ順に入るのは、セルの中の button とリンクである */

import { Link } from '@tanstack/react-router';
import {
  dotStateOf,
  type OverviewRow,
  type SortKey,
  type SortOrder,
  shownTokens,
} from '../../derive/overview.ts';
import { formatSince, formatTokens } from '../../format.ts';
import { Dot } from '../primitives/Dot.tsx';

/** まだ読んでいない欄。**空欄にしない** — 空欄は「0 だった」と読める */
const DASH = '—';
const NOT_READ = 'Not read yet';
/** 数え上げられなかった行の欄。見えたぶんは本当に在るが、それで全部とは言えない */
const SHORT = 'Some of this project could not be read — the count may be short';

/** 期間を絞っていないときに稼働のトラックが覆う幅。稼働が 1 つも無いときの目盛りとして使う */
const DEFAULT_STRIP_MS = 30 * 86_400_000;

/* 数え上げられなかった行の数に `+?` を添える。**数のすぐ隣に置く** —
   離すと、どの数が足りていないのか読めない。 */
const Short = () => <span className="dimtxt">+?</span>;

/* 数の欄ひとつ。読む前は `—`、読んだ後は 0 を空欄にする。

   0 を空欄にしてよいのは、それが「読んで、0 だった」ときだけである。数え上げられなかった
   行では、0 も空欄も「1 つも動いていない」という断定になるので、`+?` を添えて出す。 */
function Count({
  value,
  read,
  counted,
}: {
  value: number | null;
  read: boolean;
  counted: boolean;
}) {
  if (!read) {
    return (
      <span className="right mono dimtxt" role="gridcell" title={NOT_READ}>
        {DASH}
      </span>
    );
  }
  if (!counted) {
    return (
      <span className="right mono" role="gridcell" title={SHORT}>
        {value ?? 0}
        <Short />
      </span>
    );
  }
  return (
    <span className="right mono" role="gridcell">
      {value || ''}
    </span>
  );
}

/* プロジェクトの一覧。

   `subgrid` で組む都合上、**行を包む要素を増やさない。** 見出しも行も
   `.dash-grid` の直接の子で、列は親が 1 か所で決めている。表そのものが `grid` で、
   持てるのは `row` だけである。 */

interface HeadProps {
  readonly label: string;
  readonly sortKey: SortKey;
  readonly order: SortOrder;
  readonly onSort: (key: SortKey) => void;
  readonly right?: boolean;
}

/* 並べ替えの見出し。**3 つの画面で同じ class 名を使う** — `.head .sortable` の CSS が
   そのまま効くので、画面ごとに矢印の出し方を書き直さずに済む。

   セルと押しどころは入れ子にする。この列がいまどう並んでいるかを言う `aria-sort` は
   `columnheader` にしか置けず、その `columnheader` 自身を押しどころにすると、今度は
   「押せる」ことが読み上げから消える。中の `button` が押しどころを持てば、どちらも失わない。 */
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
    <div
      role="columnheader"
      aria-sort={on ? (order.direction === 'desc' ? 'descending' : 'ascending') : 'none'}
    >
      <button type="button" className={className} onClick={() => onSort(sortKey)}>
        {label}
      </button>
    </div>
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
    return <span className="dash-act" role="gridcell" title={NOT_READ} />;
  }
  const shown = row.spans.filter((span) => span[1] >= fromMs && span[0] <= toMs);
  return (
    <span
      className={`dash-act${row.spansComplete ? '' : ' cut'}`}
      role="gridcell"
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
  const tokenTotal = shownTokens(rows);

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
    <div className="dash-grid" role="grid" aria-label="Projects">
      <div className="dash-row head" role="row">
        {/* ピン留めの列にも名前を置く。**見えない形で置く** — 16px の列に語を出すと、
            その語の幅ぶんだけ列が広がって、点とピン留めの間が空く */}
        <span className="pin-col" role="columnheader">
          <span className="vhidden">Pinned</span>
        </span>
        <SortHead label="Project" sortKey="name" order={order} onSort={onSort} />
        <SortHead label="Active" sortKey="active" order={order} onSort={onSort} right />
        <SortHead label="Waiting" sortKey="waiting" order={order} onSort={onSort} right />
        <SortHead label="Input" sortKey="input" order={order} onSort={onSort} right />
        <SortHead label="Tokens 24h" sortKey="tokens" order={order} onSort={onSort} right />
        <span role="columnheader">Activity</span>
        <SortHead label="Last activity" sortKey="last" order={order} onSort={onSort} right />
      </div>

      {rows.map((row) => {
        const isPinned = pinned.has(row.id);
        /* この行の `transcript` を数え上げられたか。数え上げられていなければ、
           どの欄も「これで全部だ」という顔をしてはいけない。 */
        const counted = row.sourcesState !== 'unobservable';
        return (
          <div key={row.id} className="dash-row" role="row">
            {/* 行の属性としてのピン留め。行を開く操作とは別のクリック対象にしたいので、
                リンクの外に出して独立した button にしてある。押しどころはセルの中に置く —
                セルそのものを押しどころにすると、留めたかどうかが読み上げから消える。 */}
            <span className="pin-col" role="gridcell">
              <button
                type="button"
                className={`pin${isPinned ? ' on' : ''}`}
                aria-pressed={isPinned}
                aria-label={isPinned ? `Unpin ${row.name}` : `Pin ${row.name}`}
                onClick={() => onTogglePin(row.id)}
              >
                <i />
              </button>
            </span>

            <span className="name-col" role="gridcell">
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
            </span>

            {/* 読む前の欄は空にしない。**空欄は「0 だった」と読める。**
                読んでいないことは、`—` で「ここにはまだ何も無い」と言う。 */}
            <Count value={row.active} read={row.read} counted={counted} />
            <Count value={row.waiting} read={row.read} counted={counted} />
            <span
              className={`right mono${(row.input ?? 0) > 0 ? ' inputc' : ''}`}
              role="gridcell"
              title={row.read ? (counted ? undefined : SHORT) : NOT_READ}
            >
              {!row.read ? (
                DASH
              ) : counted ? (
                row.input || ''
              ) : (
                <>
                  {row.input ?? 0}
                  <Short />
                </>
              )}
            </span>

            {/* 観測できなかった消費は空にせず、観測できなかったと言う。
                空にすると「使っていない」と並んで見えてしまう。

                バーの長さは、**いま出ている行の合計に対する割合**である。出ている行のバーを
                足すと 100% になり、絞り込みを変えれば分母も変わる。 */}
            <span
              className={`dash-tok${row.read ? '' : ' dimtxt'}`}
              role="gridcell"
              title={
                row.read
                  ? row.tokens24hState === 'unobservable'
                    ? 'Could not be read'
                    : row.tokens24h !== null && row.tokens24h > 0
                      ? `${formatTokens(row.tokens24h)} — ${Math.round((row.tokens24h / tokenTotal) * 100)}% of the ${formatTokens(tokenTotal)} shown`
                      : undefined
                  : NOT_READ
              }
            >
              <span className="mono">
                {!row.read
                  ? DASH
                  : row.tokens24hState === 'unobservable'
                    ? '?'
                    : row.tokens24h !== null && row.tokens24h > 0
                      ? formatTokens(row.tokens24h)
                      : ''}
              </span>
              <span className="dash-bar">
                {row.read && row.tokens24h !== null && row.tokens24h > 0 && (
                  <i style={{ width: `${(row.tokens24h / tokenTotal) * 100}%` }} />
                )}
              </span>
            </span>

            <ActivityStrip row={row} fromMs={fromMs} toMs={nowMs} />

            {/* 時刻の見えない行を空欄にしてよいのは、読めて何も無かったときだけである。
                数え上げられなかった行の空欄は「ずっと静かだった」と読める。 */}
            <span
              className="right dimtxt"
              role="gridcell"
              title={row.read ? (counted ? undefined : SHORT) : NOT_READ}
            >
              {!row.read
                ? DASH
                : row.lastActivityMs !== null
                  ? formatSince(row.lastActivityMs, nowMs)
                  : counted
                    ? ''
                    : '?'}
            </span>
          </div>
        );
      })}
    </div>
  );
}
