import type { OverviewSpan, OverviewTotals } from '../../derive/overview.ts';
import { formatTokens } from '../../format.ts';

/* Overview のツールバー。検索と、いま全体がどうなっているかの 1 行。 */

export type OverviewFilter = 'all' | 'input' | 'active' | 'pinned';

export interface OverviewToolbarProps {
  readonly query: string;
  readonly onQuery: (query: string) => void;
  readonly filter: OverviewFilter;
  readonly onFilter: (filter: OverviewFilter) => void;
  readonly span: OverviewSpan;
  readonly onSpan: (span: OverviewSpan) => void;
  readonly totals: OverviewTotals;
  /** 絞り込んだ後に何も残らなかったときのために、絞り込む前の数も見せる */
  readonly shown: number;
  readonly total: number;
}

const CHIPS: readonly {
  readonly key: OverviewFilter;
  readonly label: string;
}[] = [
  { key: 'all', label: 'all' },
  { key: 'input', label: 'input' },
  { key: 'active', label: 'active' },
  { key: 'pinned', label: 'pinned' },
];

/* 期間のチップは状態のチップと別のグループにする。**同じ並びに混ぜない** —
   混ぜると、片方を押したときにもう片方が解除されたように見える。 */
const SPANS: readonly { readonly key: OverviewSpan; readonly label: string }[] = [
  { key: '24h', label: '24h' },
  { key: '7d', label: '7d' },
  { key: '30d', label: '30d' },
  // 状態のチップにも all が在る。同じ文字列を並べると、どちらが解除されたのか読めない
  { key: 'all', label: 'any time' },
];

export function OverviewToolbar({
  query,
  onQuery,
  filter,
  onFilter,
  span,
  onSpan,
  totals,
  shown,
  total,
}: OverviewToolbarProps) {
  return (
    <div className="view-toolbar">
      <input
        className="search"
        type="search"
        value={query}
        placeholder="Search projects…"
        aria-label="Search projects"
        onChange={(event) => onQuery(event.target.value)}
      />

      {CHIPS.map((chip) => (
        <button
          key={chip.key}
          type="button"
          className={`fchip${filter === chip.key ? ' on' : ''}`}
          aria-pressed={filter === chip.key}
          onClick={() => onFilter(chip.key)}
        >
          {chip.label}
        </button>
      ))}

      <span className="chip-gap" />

      {SPANS.map((one) => (
        <button
          key={one.key}
          type="button"
          className={`fchip${span === one.key ? ' on' : ''}`}
          aria-pressed={span === one.key}
          title={
            one.key === 'all'
              ? 'Show projects no matter when they last ran'
              : `Show only projects active within the last ${one.label}`
          }
          onClick={() => onSpan(one.key)}
        >
          {one.label}
        </button>
      ))}

      <span className="dash-sum">
        {shown < total && (
          <span className="dimtxt">
            {shown}/{total} ·{' '}
          </span>
        )}
        active <b className="active">{totals.active}</b> · waiting{' '}
        <b className="waiting">{totals.waiting}</b>
        {totals.input > 0 && (
          <>
            {' '}
            · input <b className="input">{totals.input}</b>
          </>
        )}{' '}
        · tokens 24h <b>{formatTokens(totals.tokens)}</b>
        {/* 欠けのある合計に「これで全部だ」という顔をさせない */}
        {totals.tokensPartial && (
          <span className="dimtxt" title="Some transcripts could not be read">
            {' '}
            +?
          </span>
        )}
      </span>
    </div>
  );
}
