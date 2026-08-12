import { useQuery } from '@tanstack/react-query';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import type { SortingState } from '@tanstack/react-table';
import { useRef } from 'react';
import { treeQuery } from '../queries/tree.query.ts';
import { AGENT_COLUMN_IDS, AgentsTable } from '../ui/components/agents/AgentsTable.tsx';
import { NotObserved } from '../ui/components/primitives/NotObserved.tsx';
import { ReadProgress } from '../ui/components/primitives/ReadProgress.tsx';
import { StatsFooter } from '../ui/components/stats/StatsFooter.tsx';
import { projectTrouble, treeTrouble } from '../ui/derive/trouble.ts';
import { useNowMs } from '../ui/hooks/useNowMs.ts';
import { useT } from '../ui/i18n/useT.ts';
import { openPanelOf, type ProjectSearch } from '../ui/nav/search.ts';
import { usePrefs } from '../ui/prefs/PrefsContext.tsx';

/* 誰が動いていて、誰が待っているか。glasshive の主画面。

   絞り込みと並べ替えは URL の検索パラメータに載せる。**「この条件で観て」と人に渡せる
   ものだから**である。木の開閉と時間帯は載せない — 開閉は見せたい対象ではなく、
   時間帯は絶対の時刻なので渡した先では別のものを指す。 */

export const Route = createFileRoute('/projects/$slug/agents')({
  component: AgentsView,
});

/** 検索パラメータが何も言っていないときの並び。起点の早い順 = イベントの起きた順 */
const DEFAULT_SORTING: SortingState = [{ id: 'timeline', desc: false }];

/* 状態と稼働区間は変更通知が無くても変わる。待ち続けているだけで「30 分動きが無い」に
   変わり、動いている稼働区間は現在まで伸び続けるので、静かなときも時計を進める。 */
const TICK_MS = 5000;

function AgentsView() {
  const t = useT();
  const { slug } = Route.useParams();
  const search: ProjectSearch = Route.useSearch();
  const navigate = useNavigate();
  const tree = useQuery(treeQuery);
  const prefs = usePrefs();
  const nowMs = useNowMs(TICK_MS);

  const project = tree.data?.projects.find((candidate) => candidate.id === slug);

  /* このプロジェクトを初めて描くか。**初回は変化のハイライトを当てない** —
     開いた瞬間に、そこに在っただけの行が一斉に光る。 */
  const seenRef = useRef(new Set<string>());
  const firstPaint = !seenRef.current.has(slug);
  seenRef.current.add(slug);

  const patch = (next: Partial<ProjectSearch>) => {
    void navigate({
      to: '.',
      search: (prev: ProjectSearch) => ({ ...prev, ...next }),
    });
  };

  /* 検索語だけは履歴を積まずに置き換える。**1 文字が 1 つの行き先ではない** —
     積むと 10 文字打った人は戻るを 10 回押すことになり、打つ前の画面へ戻れなくなる。 */
  const onQuery = (next: string) => {
    void navigate({
      to: '.',
      replace: true,
      search: (prev: ProjectSearch) => ({ ...prev, q: next === '' ? undefined : next }),
    });
  };

  /* **URL から来た名前は、表が持つ列だけを通す。** 検索パラメータは画面を移っても
     持ち越されるので、Work の列の名前がそのまま届く。渡すと TanStack が知らない列を黙って
     捨て、既定の並びごと落ちる。どの見出しも並べ替えを示さないのに、URL には
     `sort` が載ったまま残る。 */
  const sortKey = AGENT_COLUMN_IDS.find((key) => key === search.sort);
  const sorting: SortingState =
    sortKey === undefined ? DEFAULT_SORTING : [{ id: sortKey, desc: search.dir === 'desc' }];

  const panel = openPanelOf(search);
  const selectedFile = panel?.kind === 'conv' ? panel.file : null;

  if (project === undefined) {
    /* 木を読めなかったのと、読めた上でこのプロジェクトが無かったのは別の事実である。
       読めなかったほうを「無かった」と言うと、観測できなかったことが消える。 */
    if (tree.error !== null) return <NotObserved {...treeTrouble(t)} />;
    if (tree.data === undefined) return <ReadProgress label={t('Reading transcripts')} />;
    /* `~/.claude/projects` を走査できていない。木そのものは返るので行は空で並ぶが、
       **空なのは無かったからではない。** ここで「そんな名前は無い」と言うと、
       観測できなかったことの上に「無かった」という判定を建てることになる。 */
    if (tree.data.sources.state === 'unobservable') return <NotObserved {...treeTrouble(t)} />;
    // 読み終えるまでは、まだ届いていない行の中に居るかもしれない
    if (!tree.data.complete) return <ReadProgress label={t('Reading transcripts')} />;
    return <NotObserved {...projectTrouble(t, slug)} />;
  }

  return (
    <>
      <AgentsTable
        project={project}
        showAll={prefs.showAll}
        onShowAll={(showAll) => prefs.set({ showAll })}
        nowMs={nowMs}
        selectedFile={selectedFile}
        firstPaint={firstPaint}
        query={search.q ?? ''}
        onQuery={onQuery}
        attention={search.attention === true}
        onAttention={(on) => patch({ attention: on ? true : undefined })}
        sorting={sorting}
        onSorting={(next) => {
          const first = next[0];
          if (first === undefined) {
            patch({ sort: undefined, dir: undefined });
            return;
          }
          patch({ sort: first.id, dir: first.desc ? 'desc' : 'asc' });
        }}
      />
      <StatsFooter project={project} nowMs={nowMs} />
    </>
  );
}
