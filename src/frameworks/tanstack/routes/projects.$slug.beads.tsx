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

   台帳は人の手で動くので、正本ほど速くは変わらない。合図では配られないため、
   ここだけは時計で取り直す。

   **台帳が無いことと、読めなかったことを分けて見せる。** 無いなら bd を勧める案内を出す。
   読めなかったなら、読めなかったと言う — 空の一覧にすると、課題が 1 件も無い巣に見える。 */

export const Route = createFileRoute('/projects/$slug/beads')({
  component: BeadsView,
});

/** 印が何も言っていないときの並び。最後に触られた順 */
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
  /* 束ねた課題の消化と、札の索きは閉じたものまで要る。一覧とは別の鍵で持つ */
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
    return <p className="empty">観ています…</p>;
  }
  /* 断られたのと、見に行けたが無かったのは別の事実である。
     断りはこちらの求めの誤り(知らない巣の id など)で、台帳の話ではない。 */
  if (!answer.ok) {
    return <p className="empty">課題を出せませんでした({answer.body.code})</p>;
  }
  const page = answer.body;
  if (page.state === 'absent') {
    return <BdPromo />;
  }
  if (page.state === 'unobservable') {
    return <p className="empty">台帳を読めませんでした({page.reason})</p>;
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

/* 台帳が無い巣。**無いことは失敗ではない。**

   多くの巣には bd が入っていない。何が見えるようになるのかを書いておくと、
   この画面が空である理由と、埋める手立てが同時に読める。 */
function BdPromo() {
  return (
    <div id="issues-list">
      <div className="bd-promo">
        <div className="bp-title">
          <Icon path={mdiRhombus} size={12} /> この巣に bd(beads)の台帳がありません
        </div>
        <p>
          bd は AI エージェント向けの、git に載る軽い課題追跡です。この巣で <code>bd init</code>{' '}
          を走らせると、この画面に灯りが点きます — 依存の弧を添えた課題の一覧、着手順の並べ替え、
          どのエージェントがどの課題をどこで触っているかの突き合わせ、課題ごとの活動の帯。
        </p>
        <a href="https://github.com/gastownhall/beads" target="_blank" rel="noopener">
          github.com/gastownhall/beads →
        </a>
      </div>
    </div>
  );
}
