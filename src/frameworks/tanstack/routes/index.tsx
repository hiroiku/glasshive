import { useQuery } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { useMemo, useState } from 'react';
import { preferencesQuery } from '../queries/preferences.query.ts';
import { treeQuery } from '../queries/tree.query.ts';
import { DirectoryPicker } from '../ui/components/overview/DirectoryPicker.tsx';
import { OverviewTable } from '../ui/components/overview/OverviewTable.tsx';
import {
  type OverviewFilter,
  OverviewToolbar,
} from '../ui/components/overview/OverviewToolbar.tsx';
import { Dot } from '../ui/components/primitives/Dot.tsx';
import { NotObserved } from '../ui/components/primitives/NotObserved.tsx';
import { ReadProgress } from '../ui/components/primitives/ReadProgress.tsx';
import {
  DEFAULT_SORT,
  DEFAULT_SPAN,
  deriveRows,
  filterRows,
  holdOrder,
  type OverviewSpan,
  type SortKey,
  type SortOrder,
  SPAN_MS,
  sortRows,
  totalsOf,
  withinSpan,
} from '../ui/derive/overview.ts';
import { transcriptScan } from '../ui/derive/sources.ts';
import { treeTrouble } from '../ui/derive/trouble.ts';
import { useTabSelection } from '../ui/hooks/useTabSelection.ts';
import { useT } from '../ui/i18n/useT.ts';

export const Route = createFileRoute('/')({
  /* 先に走らせるだけで、待たない。待つと、それぞれの画面が持っている
     「まだ何も無いときの案内」が、のっぺりした読み込み中の表示に置き換わってしまう。 */
  loader: ({ context }) => {
    void context.queryClient.ensureQueryData(treeQuery);
    void context.queryClient.ensureQueryData(preferencesQuery);
  },
  component: Overview,
});

/* 観ると決めたプロジェクトの一覧。

   **並ぶのは、観ると決めたものだけである。** 機械の中で動いた Claude Code を全部並べると、
   自分がいま何を見ているのかが分からなくなる。見つけたものは、下の一覧から選び直せる。 */
function Overview() {
  const t = useT();
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
  const complete = tree.data?.complete ?? false;

  const shown = useMemo(() => {
    const byChip = withinSpan(rows, span, nowMs).filter((row) => {
      /* 読んでいない行は、どちらの絞り込みにも残す。**落とすと集合の断定になる** —
         「人待ちはこれで全部」と言えるのは全部を読んだ後だけで、それまでは
         まだ読んでいない行のほうに在るかもしれない。 */
      if (filter === 'input') return !row.read || (row.input ?? 0) > 0;
      if (filter === 'active') return !row.read || (row.active ?? 0) > 0;
      return true;
    });
    /* 読み終えるまで並べ替えない。**部分集合に順位を付けない。**

       既定の並びは人待ち・稼働・待機から作られるが、それは最後に届く値である。届くたびに
       並べ直すと、まだ読んでいない行が読まれた瞬間に上へ割り込み、既に落ち着いた行が
       カーソルの下で動く。索引の並び(最終活動の新しい順)のまま待つ。 */
    const filtered = filterRows(byChip, query);
    return complete ? sortRows(filtered, order) : filtered;
  }, [rows, filter, span, nowMs, query, order, complete]);

  const totals = useMemo(() => totalsOf(rows), [rows]);
  /* 数え上げられなかった行の数。**絞り込む前の一覧で数える** — 絞り込みで隠れただけの行を
     「読めた」ことにすると、警告が絞り込みのたびに出たり消えたりする。 */
  const unreadableRows = useMemo(
    () => rows.filter((row) => row.sourcesState === 'unobservable').length,
    [rows],
  );

  /* 触っている間は並びを止める。**順位付けは変えない** —— 覚えた並びで出し直すだけである。

     既定の並びは人待ち・稼働・最終活動から作られるので、変更通知が届くたびに行が動く。
     観ると決めるのは行を狙って押す操作なので、狙った行がその瞬間に入れ替わると押し間違える。
     絞り込みと並べ替えを変えたときは覚えを捨てる —— そこで止めたままにすると、
     押した並べ替えが効かなかったように見える。 */
  const [held, setHeld] = useState<readonly string[] | null>(null);
  const ordered = held === null ? shown : holdOrder(shown, held);
  const hold = () => setHeld((current) => current ?? shown.map((row) => row.id));
  const thaw = () => setHeld(null);
  /* 止める入口と解く出口を対にする。**focus で止めたものは focus が出たときに解く** —
     マウスの出口しか無いと、キーボードだけで表に入ったユーザーの並びは二度と直らない。
     行から行へ送っているあいだは止めたままにする。 */
  const thawOnLeave = (event: React.FocusEvent<HTMLDivElement>) => {
    if (event.currentTarget.contains(event.relatedTarget)) return;
    thaw();
  };

  const onSort = (key: SortKey) => {
    thaw();
    /* 同じ列をもう一度押したら向きが返る。別の列なら、その列で自然な向きから始める。
       名前だけは昇順が自然で、数と時刻は多い順・新しい順が自然である。 */
    setOrder((current) =>
      current.key === key
        ? { key, direction: current.direction === 'desc' ? 'asc' : 'desc' }
        : { key, direction: key === 'name' ? 'asc' : 'desc' },
    );
  };

  if (tree.error !== null) return <NotObserved {...treeTrouble(t)} />;
  if (tree.isPending) {
    return (
      <ReadProgress
        label={t('Reading transcripts')}
        slowNote={t('A large ~/.claude/projects takes a moment on the first read')}
      />
    );
  }

  const { projects, sources, processes } = tree.data;

  return (
    <>
      {/* ツールバーは本文の外に置く。中に入れるとスクロールと一緒に流れて、検索欄が見えなくなる */}
      <OverviewToolbar
        query={query}
        onQuery={(next) => {
          thaw();
          setQuery(next);
        }}
        filter={filter}
        onFilter={(next) => {
          thaw();
          setFilter(next);
        }}
        span={span}
        onSpan={(next) => {
          thaw();
          setSpan(next);
        }}
        totals={totals}
        shown={shown.length}
        total={rows.length}
        progress={
          tree.data.progress === null
            ? null
            : {
                read: rows.filter((row) => row.read).length,
                total: rows.length,
              }
        }
      />

      {/* biome-ignore lint/a11y/noStaticElementInteractions: 並びを止めるだけで、押せる場所ではない */}
      <div
        id="dash"
        onMouseMove={hold}
        onMouseLeave={thaw}
        onFocusCapture={hold}
        onBlurCapture={thawOnLeave}
      >
        {/* 観測できなかったことは、見えた振りをせずにそのまま言う */}
        {sources.state === 'unobservable' && (
          <p className="warn">
            {t('Could not read the transcript roots — projects are not missing, we could not look')}
          </p>
        )}
        {/* 走査できなかったプロジェクトは行として残るが、数はどれも欠けている。
            行の欄だけで言うと、一覧を上から眺めている人には届かない */}
        {unreadableRows > 0 && (
          <p className="warn">
            {t(
              '{n, plural, one {# project could not be read — its row shows what we could see, not what is there} other {# projects could not be read — their rows show what we could see, not what is there}}',
              { n: unreadableRows },
            )}
          </p>
        )}
        {processes.state === 'unobservable' && (
          <p className="warn">
            {t('Could not count live processes — waiting and ended cannot be told apart')}
          </p>
        )}
        {tabs.storedState === 'unobservable' && (
          <p className="warn">
            {t('Could not read the watched projects — the order fell back to the default')}
          </p>
        )}
        {tabs.error !== null && <p className="warn">{tabs.error}</p>}

        {/* 見つけたものは、記録していなくても伝える。伝えないと、Claude Code を走らせた
            ことのあるディレクトリを画面から選べない */}
        <DirectoryPicker
          candidates={tabs.candidates}
          watched={tabs.watched}
          onWatch={tabs.toggleWatch}
          open={projects.length === 0}
          nowMs={nowMs}
        />

        {projects.length === 0 ? (
          /* **読み終えるまで「1 つも無い」と言わない。** 索引がまだ届いていないだけかもしれず、
             「無かった」と「まだ観測していない」を同じ画面にすると見分けが付かない。 */
          !tree.data.complete ? (
            <ReadProgress label={t('Reading transcripts')} scan={transcriptScan(t, tree.data)} />
          ) : (
            <p className="empty">
              {/* 「無かった」と「観測できなかった」を同じ文にしない。**片方は 0 で、
                  もう片方は不明である。** 同じに書くと、読む人は在るものを無いと読む */}
              {sources.state === 'observed'
                ? tabs.candidates.length > 0
                  ? t(
                      'Nothing watched yet — pick a directory above, or run `glasshive` where you work',
                    )
                  : t('Nothing watched yet — run `glasshive` in a directory to watch it')
                : sources.state === 'absent'
                  ? t('Nothing to read yet — ~/.claude/projects is not there')
                  : t('Unknown — the projects could not be counted')}
            </p>
          )
        ) : shown.length === 0 ? (
          /* 絞って何も残らなかったことを、プロジェクトが 1 つも無いことと同じ表示にしない。
             読み終えていないなら、まだ読んでいない行のほうに在るかもしれないと言う。 */
          <p className="empty">
            {tree.data.complete
              ? t('No matching projects (0 of {total})', { total: rows.length })
              : t('No matches yet among the projects read so far (0 of {total})', {
                  total: rows.length,
                })}
          </p>
        ) : (
          <OverviewTable
            rows={ordered}
            order={order}
            onSort={onSort}
            watched={tabs.watched}
            onToggleWatch={tabs.toggleWatch}
            nowMs={nowMs}
            spanMs={SPAN_MS[span]}
          />
        )}
      </div>

      {/* 凡例は画面の下。**説明を書かない色やトラックを出さない** —
          読めない絵は、読む人にとって在っても無くても同じである */}
      <div className="legend-bar">
        <span>
          <Dot state="input" /> {t('waiting for you')}
        </span>
        <span>
          <Dot state="active" /> {t('an agent is working')}
        </span>
        <span>
          <Dot state="waiting" /> {t('idle, but the process is alive')}
        </span>
        <span>
          <Dot state="ended" /> {t('nothing running')}
        </span>
        <span>
          <Dot state="unknown" /> {t('not read yet, or could not be read')}
        </span>
        <span>
          <i className="lg-bar" />{' '}
          {t('share of the tokens spent in the last 24h by the projects shown')}
        </span>
        <span>
          <i className="lg-act" />{' '}
          {t('when anything in the project was running, over the {span} window', { span })}
        </span>
        <span>
          <i className="lg-act cut" /> {t('some of that activity could not be read')}
        </span>
      </div>
    </>
  );
}
