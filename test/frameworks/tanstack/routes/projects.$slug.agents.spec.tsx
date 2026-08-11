import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { SortingState } from '@tanstack/react-table';
import { render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { reduceTree } from '~/frameworks/tanstack/queries/tree.query.ts';
import type { ProjectSearch } from '~/frameworks/tanstack/ui/nav/search.ts';

/* Agents の画面が、届いた木と URL の検索パラメータから何を出すかを見る。

   見るのは 2 つ。**検索パラメータは画面を移っても持ち越される**ので、Work の列の名前が
   そのまま届く。表が持たない名前を渡すと、その並べ替えごと既定の並びが落ちる。
   もう 1 つは、行が 1 つも無いときに何と言うかである —— 走査できなかったことの上に
   「無かった」という判定を建てると、観測していないものを断定したことになる。 */

/* 材料の形は、木を畳む実装から引く。ここは外部 API の形を宣言した層を `import` できない。 */
type TreeJson = Parameters<typeof reduceTree>[0];
type ProjectJson = TreeJson['projects'][number];

const probe = vi.hoisted(() => ({
  slug: 'demo',
  /** URL に載っている検索パラメータ。テストごとに差し替える */
  search: {} as ProjectSearch,
  /** 表が受け取った並べ替え。表そのものの描き方はここでは問わない */
  sorting: null as SortingState | null,
}));

vi.mock('@tanstack/react-router', () => ({
  createFileRoute: () => (options: unknown) => ({
    options,
    useParams: () => ({ slug: probe.slug }),
    useSearch: () => probe.search,
  }),
  lazyRouteComponent: (load: unknown) => load,
  useNavigate: () => () => undefined,
}));

vi.mock('~/frameworks/tanstack/queries/tree.query.ts', () => ({
  treeQueryKey: ['tree'],
  treeQuery: { queryKey: ['tree'] },
}));

vi.mock('~/frameworks/tanstack/ui/prefs/PrefsContext.tsx', () => ({
  usePrefs: () => ({ dock: true, drawerWidth: null, showAll: false, notify: false, set: () => {} }),
}));

vi.mock('~/frameworks/tanstack/ui/components/stats/StatsFooter.tsx', () => ({
  StatsFooter: () => <div id="stats" />,
}));

/* 表は受け取った並べ替えを書き出すだけの板に差し替える。**列の名前は本物のまま使う** ——
   ここで名前を書き写すと、列が増えても減ってもテストは同じ答えを出し続ける。 */
vi.mock('~/frameworks/tanstack/ui/components/agents/AgentsTable.tsx', async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import('~/frameworks/tanstack/ui/components/agents/AgentsTable.tsx')
    >();
  return {
    AGENT_COLUMN_IDS: actual.AGENT_COLUMN_IDS,
    AgentsTable: ({ sorting }: { sorting: SortingState }) => {
      probe.sorting = sorting;
      return <div id="agents" />;
    },
  };
});

const { AGENT_COLUMN_IDS } = await import(
  '~/frameworks/tanstack/ui/components/agents/AgentsTable.tsx'
);
const { Route } = await import('~/frameworks/tanstack/routes/projects.$slug.agents.tsx');

/* ルートのファイルは、プラグインが `component` を別のチャンクへ切り出す。
   出来上がったルートから辿る — 切り出し先の名前を直に書くと、そちらの都合で壊れる。 */
type SplitComponent = {
  options: { component: () => Promise<{ component: () => React.ReactNode }> };
};
const { component: AgentsView } = await (Route as unknown as SplitComponent).options.component();

const AT = '2026-08-09T12:00:00Z';

const project = (id: string): ProjectJson => ({
  id,
  slug: id,
  path: `/w/${id}`,
  name: id,
  live_process: false,
  live_process_count: 0,
  tokens_24h: null,
  tokens_24h_state: 'observed',
  read: true,
  sources: { state: 'observed', reason: null },
  sessions: [],
});

const tree = (over: Partial<TreeJson> = {}): TreeJson => ({
  generated_at: AT,
  active_threshold_secs: 300,
  sources: { state: 'observed', reason: null },
  processes: { state: 'observed', reason: null },
  complete: true,
  progress: null,
  projects: [project(probe.slug)],
  ...over,
});

function draw(data: TreeJson, search: ProjectSearch = {}) {
  probe.search = search;
  probe.sorting = null;
  const client = new QueryClient({
    // 問い合わせは走らせない。ここで見るのは、届いた木を画面がどう読むかだけである
    defaultOptions: { queries: { enabled: false, retry: false } },
  });
  client.setQueryData(['tree'], data);
  const { container } = render(
    <QueryClientProvider client={client}>
      <AgentsView />
    </QueryClientProvider>,
  );
  return { container, said: container.textContent ?? '' };
}

/** 検索パラメータが何も言っていないときの並び。起点の早い順 */
const DEFAULT_SORTING: SortingState = [{ id: 'timeline', desc: false }];

describe('URL から来た並べ替えを、この表が持つ列だけに通す', () => {
  it('この表に無い列の名前が来たら、既定の並びで出す', () => {
    draw(tree(), { sort: 'title', dir: 'desc' });

    expect(
      probe.sorting,
      '知らない名前をそのまま渡すと、その並べ替えごと既定の並びが落ちる',
    ).toEqual(DEFAULT_SORTING);
  });

  it('この表が持つ列の名前は、向きごとそのまま効かせる', () => {
    draw(tree(), { sort: 'tokens', dir: 'desc' });

    expect(probe.sorting).toEqual([{ id: 'tokens', desc: true }]);
  });

  it('向きが載っていなければ、昇順で読む', () => {
    draw(tree(), { sort: 'updated' });

    expect(probe.sorting).toEqual([{ id: 'updated', desc: false }]);
  });

  it('並べ替えが載っていなければ、既定の並びで出す', () => {
    draw(tree());

    expect(probe.sorting).toEqual(DEFAULT_SORTING);
  });

  /** Work の画面が URL に載せる並べ替えの名前。画面を移れば、そのままここへ届く */
  const WORK_SORT_KEYS = [
    'start',
    'id',
    'title',
    'status',
    'type',
    'labels',
    'assignee',
    'updated',
    'name',
    'ahead',
    'date',
  ];

  it('Work から持ち越された名前でも、表へ渡すのは表が持つ列だけである', () => {
    for (const sort of WORK_SORT_KEYS) {
      draw(tree(), { sort });
      const [first] = probe.sorting ?? [];

      expect(first, `sort=${sort}`).toBeDefined();
      expect(AGENT_COLUMN_IDS as readonly string[], `sort=${sort}`).toContain(first?.id);
    }
  });
});

describe('このプロジェクトの行が並んでいないとき、何と言うか', () => {
  const MISSING = 'No project by that name';

  it('`~/.claude/projects` を走査できていないなら、そんな名前は無いと言わない', () => {
    const { said } = draw(
      tree({ sources: { state: 'unobservable', reason: 'eacces' }, projects: [] }),
    );

    expect(said, '観測できなかったことの上に、無かったという判定を建てない').not.toContain(MISSING);
    expect(said).toContain('Could not read the transcripts directory');
  });

  it('まだ読み終えていないなら、そんな名前は無いと言わない', () => {
    const { container, said } = draw(tree({ complete: false, projects: [] }));

    expect(said, 'まだ届いていない行の中に居るかもしれない').not.toContain(MISSING);
    expect(container.querySelector('[role="progressbar"]')).not.toBeNull();
  });

  it('読み終えたうえで行が無いなら、そんな名前は無いと言う', () => {
    const { said } = draw(tree({ projects: [project('other')] }));

    expect(said, '読み終えて見当たらないことは、断定できる観測である').toContain(MISSING);
    expect(said).toContain(probe.slug);
  });

  it('走査した先にディレクトリが無かったなら、そんな名前は無いと言う', () => {
    const { said } = draw(
      tree({ sources: { state: 'absent', reason: 'no-source' }, projects: [] }),
    );

    expect(said, '無かったことは、観測できなかったことではない').toContain(MISSING);
  });

  it('行が並んでいれば、表を出す', () => {
    const { container } = draw(tree());

    expect(container.querySelector('#agents')).not.toBeNull();
  });
});
