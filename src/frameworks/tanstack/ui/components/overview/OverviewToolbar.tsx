import type { OverviewSpan, OverviewTotals } from '../../derive/overview.ts';
import { formatTokens } from '../../format.ts';
import { SearchInput } from '../primitives/SearchInput.tsx';

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
  /* どこまで読んだか。読み終えていれば `null`。

     **合計を出しながら黙らないためにここへ渡す。** 読み終える前の合計は、読めた行しか
     数えていない。数え終えた合計と同じ顔で出すと、その数はいつまでも小さいまま正しく見える。 */
  readonly progress: { readonly read: number; readonly total: number } | null;
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
  progress,
}: OverviewToolbarProps) {
  /* 欠けている理由で文を分ける。**読んでいる途中なら待てば揃うが、読めなかったものは
     待っても揃わない。** 同じ文で伝えると、ユーザーはいつまでも揃うのを待つ。 */
  const partialTitle = totals.unreadable
    ? 'Some projects could not be read — the counts may be short'
    : totals.partial
      ? 'Counted from the projects read so far'
      : 'Some transcripts could not be read';
  /* まだ数え終えていない合計にはその旨を添える。**付けないと、途中の数が最終の数に見える。** */
  const partialMark = totals.partial ? (
    <span className="dimtxt" title={partialTitle}>
      +?
    </span>
  ) : null;
  return (
    <div className="view-toolbar">
      <SearchInput
        value={query}
        onChange={onQuery}
        placeholder="Search projects…"
        label="Search projects"
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
        {/* まだ全部を読んでいないなら、どこまで読んだかを数で言う */}
        {progress !== null && (
          <span className="dimtxt" title="Reading the transcripts of each project">
            {progress.read} of {progress.total} projects read ·{' '}
          </span>
        )}
        {shown < total && (
          <span className="dimtxt">
            {shown}/{total} ·{' '}
          </span>
        )}
        active <b className="active">{totals.active}</b>
        {partialMark} · waiting <b className="waiting">{totals.waiting}</b>
        {partialMark}
        {totals.input > 0 && (
          <>
            {' '}
            · input <b className="input">{totals.input}</b>
            {partialMark}
          </>
        )}{' '}
        · tokens 24h <b>{formatTokens(totals.tokens)}</b>
        {/* 欠けのある合計に「これで全部だ」という顔をさせない */}
        {totals.tokensPartial && (
          <span className="dimtxt" title={partialTitle}>
            {' '}
            +?
          </span>
        )}
      </span>
    </div>
  );
}
