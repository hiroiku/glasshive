import { mdiRhombus } from '@mdi/js';
import { useQuery } from '@tanstack/react-query';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useMemo, useState } from 'react';
import { issuesQuery } from '../queries/issues.query.ts';
import { treeQuery } from '../queries/tree.query.ts';
import { FlowChart } from '../ui/components/issues/FlowChart.tsx';
import { type IssueSortKey, IssuesTable } from '../ui/components/issues/IssuesTable.tsx';
import { IssuesToolbar } from '../ui/components/issues/IssuesToolbar.tsx';
import { Icon } from '../ui/components/primitives/Icon.tsx';
import { workerIndex } from '../ui/derive/workers.ts';
import { useNowMs } from '../ui/hooks/useNowMs.ts';
import type { ProjectSearch } from '../ui/nav/search.ts';

/* 課題の画面。

   台帳は人の手で動くので、`transcript` ほど速くは変わらない。変更通知では配られないため、
   ここだけは時計で取り直す。

   **台帳が無いことと、観測できなかったことを分けて見せる。** 無いなら bd を勧める案内を
   出す。観測できなかったならそう言う — 空の一覧にすると、課題が 1 件も無いプロジェクトに
   見える。 */

export const Route = createFileRoute('/projects/$slug/beads')({
  component: BeadsView,
});

/** 検索パラメータが何も言っていないときの並び。最後に更新された順 */
const DEFAULT_ORDER = { key: 'updated', direction: 'desc' } as const;

const SORT_KEYS: readonly IssueSortKey[] = [
  'start',
  'id',
  'title',
  'status',
  'priority',
  'type',
  'labels',
  'assignee',
  'updated',
];

/** 相対の時刻の表示を進めるためだけの時計。台帳そのものは取り直さない */
const TICK_MS = 15_000;

function BeadsView() {
  const { slug } = Route.useParams();
  const search: ProjectSearch = Route.useSearch();
  const navigate = useNavigate();
  const nowMs = useNowMs(TICK_MS);
  const [flow, setFlow] = useState(false);

  const tree = useQuery(treeQuery);
  const includeClosed = search.closed === true;
  const ledger = useQuery(issuesQuery(slug, includeClosed));
  /* 束ねた課題の消化と、チップのインデックスは閉じたものまで要る。一覧とは別の `queryKey` で持つ */
  const whole = useQuery(issuesQuery(slug, true));

  const project = tree.data?.projects.find((candidate) => candidate.id === slug);
  const workers = useMemo(() => workerIndex(project), [project]);

  const patch = (next: Partial<ProjectSearch>) => {
    void navigate({
      to: '.',
      search: (prev: ProjectSearch) => ({ ...prev, ...next }),
    });
  };

  const sortKey = SORT_KEYS.find((key) => key === search.sort);
  const order =
    sortKey === undefined
      ? DEFAULT_ORDER
      : { key: sortKey, direction: search.dir === 'asc' ? ('asc' as const) : ('desc' as const) };

  const onSort = (key: IssueSortKey) => {
    if (key === 'start') {
      patch({ sort: order.key === 'start' ? undefined : 'start', dir: undefined });
      return;
    }
    // 同じ列をもう一度押したら向きが返る。別の列なら、その列の自然な向きから始める
    const flip = order.key === key && order.direction === 'asc' ? 'desc' : 'asc';
    patch({ sort: key, dir: flip });
  };

  const answer = ledger.data;
  if (answer === undefined) {
    return <p className="empty">Loading…</p>;
  }
  /* 断られたのと、観測できたが無かったのは別の事実である。
     断りはこちらの呼び出しの誤り(観測していないプロジェクトの id など)で、台帳の話ではない。 */
  if (!answer.ok) {
    return <p className="empty">Could not load issues ({answer.body.code})</p>;
  }
  const page = answer.body;
  if (page.state === 'absent') {
    return <BdPromo />;
  }
  if (page.state === 'unobservable') {
    return <p className="empty">Could not read the ledger ({page.reason})</p>;
  }
  /* 全量は無理に待たない。届くまでは一覧そのものを母集団として使う —
     束ねた課題の消化が少なめに出るが、待って画面を止めるよりよい。 */
  const all = whole.data?.ok === true ? whole.data.body.issues : page.issues;

  return (
    <>
      <IssuesToolbar
        query={search.q ?? ''}
        onQuery={(query) => patch({ q: query === '' ? undefined : query })}
        counts={page.counts}
        status={search.status ?? null}
        onStatus={(status) => patch({ status: status ?? undefined })}
        includeClosed={includeClosed}
        onIncludeClosed={(on) => patch({ closed: on ? true : undefined })}
        flow={flow}
        onFlow={setFlow}
      />
      {flow && <FlowChart issues={all} nowMs={nowMs} />}
      <IssuesTable
        issues={page.issues}
        all={all}
        project={project}
        workers={workers}
        query={search.q ?? ''}
        onQuery={(query) => patch({ q: query === '' ? undefined : query })}
        status={search.status ?? null}
        order={order}
        onSort={onSort}
        nowMs={nowMs}
        firstPaint={false}
      />
    </>
  );
}

/* 台帳が無いプロジェクト。**無いことは失敗ではない。**

   多くのプロジェクトには bd が入っていない。何が見えるようになるのかを書いておくと、
   この画面が空である理由と、埋める手立てが同時に読める。 */
function BdPromo() {
  return (
    <div id="issues-list">
      <div className="bd-promo">
        <div className="bp-title">
          <Icon path={mdiRhombus} size={12} /> No bd (beads) ledger in this project
        </div>
        <p>
          bd is a lightweight, git-native issue tracker built for AI agents. Run{' '}
          <code>bd init</code> in this project and this view lights up: the issue list with its
          dependency graph, start-order sorting, live matching of which agent works on which issue
          (and where), and per-issue agent activity timelines.
        </p>
        <a href="https://github.com/gastownhall/beads" target="_blank" rel="noopener">
          github.com/gastownhall/beads →
        </a>
      </div>
    </div>
  );
}
