import type { Translator } from '~/interface/i18n/translator.ts';
import type { OverviewSpan, OverviewTotals } from '../../derive/overview.ts';
import { formatTokens } from '../../format.ts';
import { useT } from '../../i18n/useT.ts';
import { SearchInput } from '../primitives/SearchInput.tsx';

/* Overview のツールバー。検索と、いま全体がどうなっているかの 1 行。 */

export type OverviewFilter = 'all' | 'input' | 'active' | 'watched';

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

const chips = (
  t: Translator,
): readonly { readonly key: OverviewFilter; readonly label: string }[] => [
  { key: 'all', label: t('all') },
  { key: 'input', label: t('input') },
  { key: 'active', label: t('active') },
  { key: 'watched', label: t('watched') },
];

/* 期間のチップは状態のチップと別のグループにする。**同じ並びに混ぜない** —
   混ぜると、片方を押したときにもう片方が解除されたように見える。 */
const spans = (
  t: Translator,
): readonly { readonly key: OverviewSpan; readonly label: string; readonly span: string }[] => [
  { key: '24h', label: '24h', span: '24h' },
  { key: '7d', label: '7d', span: '7d' },
  { key: '30d', label: '30d', span: '30d' },
  // 状態のチップにも all が在る。同じ文字列を並べると、どちらが解除されたのか読めない
  { key: 'all', label: t('any time'), span: '' },
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
  const t = useT();
  /* 欠けている理由で文を分ける。**読んでいる途中なら待てば揃うが、読めなかったものは
     待っても揃わない。** 同じ文で伝えると、ユーザーはいつまでも揃うのを待つ。 */
  const partialTitle = totals.unreadable
    ? t('Some projects could not be read — the counts may be short')
    : totals.partial
      ? t('Counted from the projects read so far')
      : t('Some transcripts could not be read');
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
        placeholder={t('Search projects…')}
        label={t('Search projects')}
      />

      {chips(t).map((chip) => (
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

      {spans(t).map((one) => (
        <button
          key={one.key}
          type="button"
          className={`fchip${span === one.key ? ' on' : ''}`}
          aria-pressed={span === one.key}
          title={
            one.key === 'all'
              ? t('Show projects no matter when they last ran')
              : t('Show only projects active within the last {span}', { span: one.span })
          }
          onClick={() => onSpan(one.key)}
        >
          {one.label}
        </button>
      ))}

      <span className="dash-sum">
        {/* まだ全部を読んでいないなら、どこまで読んだかを数で言う */}
        {progress !== null && (
          <span className="dimtxt" title={t('Reading the transcripts of each project')}>
            {t('{read} of {total} projects read', {
              read: progress.read,
              total: progress.total,
            })}{' '}
            ·{' '}
          </span>
        )}
        {shown < total && (
          <span className="dimtxt">
            {shown}/{total} ·{' '}
          </span>
        )}
        {t('active')} <b className="active">{totals.active}</b>
        {partialMark} · {t('waiting')} <b className="waiting">{totals.waiting}</b>
        {partialMark}
        {totals.input > 0 && (
          <>
            {' '}
            · {t('input')} <b className="input">{totals.input}</b>
            {partialMark}
          </>
        )}{' '}
        · {t('tokens 24h')} <b>{formatTokens(totals.tokens)}</b>
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
