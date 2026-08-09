import { useQuery } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { useMemo, useState } from 'react';
import { preferencesQuery } from '../queries/preferences.query.ts';
import { treeQuery } from '../queries/tree.query.ts';
import { OverviewTable } from '../ui/components/overview/OverviewTable.tsx';
import {
  type OverviewFilter,
  OverviewToolbar,
} from '../ui/components/overview/OverviewToolbar.tsx';
import {
  DEFAULT_SORT,
  DEFAULT_SPAN,
  deriveRows,
  filterRows,
  type OverviewSpan,
  type SortKey,
  type SortOrder,
  sortRows,
  totalsOf,
  withinSpan,
} from '../ui/derive/overview.ts';
import { useTabSelection } from '../ui/hooks/useTabSelection.ts';

export const Route = createFileRoute('/')({
  /* 先に走らせるだけで、待たない。待つと、それぞれの画面が持っている
     「まだ何も無いときの案内」が、のっぺりした読み込み中の表示に置き換わってしまう。 */
  loader: ({ context }) => {
    void context.queryClient.ensureQueryData(treeQuery);
    void context.queryClient.ensureQueryData(preferencesQuery);
  },
  component: Overview,
});

/* 巣の一覧。**どこから起動しても同じものが並ぶ。**

   タブに出すものは観る人が選ぶ。選びは見せ方の話で、何を観測するかには一切効かない。 */
function Overview() {
  const tree = useQuery(treeQuery);
  const tabs = useTabSelection();
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<OverviewFilter>('all');
  const [span, setSpan] = useState<OverviewSpan>(DEFAULT_SPAN);
  const [order, setOrder] = useState<SortOrder>(DEFAULT_SORT);

  /* 今の時刻は描くたびに 1 つだけ決める。行ごとに引き直すと、
     同じ画面の中で「3秒前」と「4秒前」が混ざる。 */
  const nowMs = tree.data === undefined ? 0 : Date.parse(tree.data.generated_at);

  const rows = useMemo(() => (tree.data ? deriveRows(tree.data.projects) : []), [tree.data]);

  const shown = useMemo(() => {
    const byChip = withinSpan(rows, span, nowMs).filter((row) => {
      if (filter === 'input') return row.input > 0;
      if (filter === 'active') return row.active > 0;
      if (filter === 'pinned') return tabs.pinned.has(row.id);
      return true;
    });
    return sortRows(filterRows(byChip, query), order);
  }, [rows, filter, span, nowMs, query, order, tabs.pinned]);

  const totals = useMemo(() => totalsOf(rows), [rows]);

  const onSort = (key: SortKey) => {
    /* 同じ列をもう一度押したら向きが返る。別の列なら、その列で自然な向きから始める。
       呼び名だけは昇り順が自然で、数と時刻は多い順・新しい順が自然である。 */
    setOrder((current) =>
      current.key === key
        ? { key, direction: current.direction === 'desc' ? 'asc' : 'desc' }
        : { key, direction: key === 'name' ? 'asc' : 'desc' },
    );
  };

  if (tree.isPending) return <p className="empty">観ています…</p>;
  if (tree.error !== null) return <p className="empty">観測を取り出せませんでした</p>;

  const { projects, sources, processes } = tree.data;

  return (
    <>
      {/* 帯は本文の外に置く。中に入れると巻きと一緒に流れて、探し口が見えなくなる */}
      <OverviewToolbar
        query={query}
        onQuery={setQuery}
        filter={filter}
        onFilter={setFilter}
        span={span}
        onSpan={setSpan}
        totals={totals}
        shown={shown.length}
        total={rows.length}
      />

      <div id="dash">
        {/* 見えなかったことは、見えた振りをせずにそのまま言う */}
        {sources.state === 'unobservable' && (
          <p className="warn">
            正本の置き場を読めませんでした。巣が無いのではなく、見に行けていません。
          </p>
        )}
        {processes.state === 'unobservable' && (
          <p className="warn">
            生きている道具を数えられませんでした。待機と終了の見分けが付きません。
          </p>
        )}
        {tabs.storedState === 'unobservable' && (
          <p className="warn">留めた印を読めませんでした。並びは既定に戻っています。</p>
        )}
        {tabs.error !== null && <p className="warn">{tabs.error}</p>}

        {projects.length === 0 ? (
          <p className="empty">
            {sources.state === 'observed'
              ? 'まだ巣がありません。Claude Code を動かすと、ここに並びます。'
              : '巣を数えられませんでした。'}
          </p>
        ) : shown.length === 0 ? (
          // 絞って何も残らなかったことを、巣が無いことと同じ顔で出さない
          <p className="empty">この絞りに合う巣はありません({rows.length} 件のうち 0 件)</p>
        ) : (
          <OverviewTable
            rows={shown}
            order={order}
            onSort={onSort}
            pinned={tabs.pinned}
            onTogglePin={tabs.togglePin}
            nowMs={nowMs}
          />
        )}
      </div>
    </>
  );
}
