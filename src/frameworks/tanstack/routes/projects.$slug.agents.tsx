import { useQuery } from '@tanstack/react-query';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import type { SortingState } from '@tanstack/react-table';
import { useRef } from 'react';
import { treeQuery } from '../queries/tree.query.ts';
import { AgentsTable } from '../ui/components/agents/AgentsTable.tsx';
import { StatsFooter } from '../ui/components/stats/StatsFooter.tsx';
import { useNowMs } from '../ui/hooks/useNowMs.ts';
import { openPanelOf, type ProjectSearch } from '../ui/nav/search.ts';
import { usePrefs } from '../ui/prefs/PrefsContext.tsx';

/* 誰が動いていて、誰が待っているか。この道具の主画面。

   絞りと並べ替えは道の印に載せる。**「この条件で観て」と人に渡せるものだから**である。
   木の開閉と時間帯は載せない — 開閉は見せたい対象ではなく、時間帯は絶対の時刻なので
   渡した先では別のものを指す。 */

export const Route = createFileRoute('/projects/$slug/agents')({
  component: AgentsView,
});

/** 印が何も言っていないときの並び。起点の早い順 = 物語の順 */
const DEFAULT_SORTING: SortingState = [{ id: 'timeline', desc: false }];

/* 様子と帯は合図が無くても変わる。待ち続けているだけで「30 分動きが無い」に変わり、
   動いている帯は現在まで伸び続けるので、静かなときも時計を進める。 */
const TICK_MS = 5000;

function AgentsView() {
  const { slug } = Route.useParams();
  const search: ProjectSearch = Route.useSearch();
  const navigate = useNavigate();
  const tree = useQuery(treeQuery);
  const prefs = usePrefs();
  const nowMs = useNowMs(TICK_MS);

  const project = tree.data?.projects.find((candidate) => candidate.id === slug);

  /* この巣を初めて描くか。**初回は変化の光を当てない** —
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

  const sorting: SortingState =
    search.sort === undefined
      ? DEFAULT_SORTING
      : [{ id: search.sort, desc: search.dir === 'desc' }];

  const panel = openPanelOf(search);
  const selectedFile = panel?.kind === 'conv' ? panel.file : null;

  if (project === undefined) {
    // 木がまだ届いていないだけかもしれない。無いと言い切らずに黙って待つ
    return <p className="empty">{tree.data === undefined ? 'Loading…' : 'Project not observed'}</p>;
  }

  return (
    <>
      <AgentsTable
        project={project}
        showAll={prefs.showAll}
        nowMs={nowMs}
        selectedFile={selectedFile}
        firstPaint={firstPaint}
        query={search.q ?? ''}
        onQuery={(q) => patch({ q: q === '' ? undefined : q })}
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
