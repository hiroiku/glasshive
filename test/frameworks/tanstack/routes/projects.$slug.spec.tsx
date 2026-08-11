import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { reduceTree } from '~/frameworks/tanstack/queries/tree.query.ts';
import type { ProjectSearch } from '~/frameworks/tanstack/ui/nav/search.ts';

/* プロジェクト 1 つぶんの枠が、パネルの開閉について何を引き受けるかを見る。

   閉じるキーは `document` に張るので、画面のどこで押しても届く。**そのぶん、打ち込んで
   いる人からも奪う** —— 入力は `Escape` を編集の取り消しに使うので、そこまで効かせると
   1 打鍵で読んでいたパネルまで閉じる。開いていないときに受けるのも同じ話で、閉じるものが
   無いのに閉じる操作だけが走る。

   パネルが滑って隠れることそのものは CSS が決めるので、ここでは見られない。見られるのは、
   その CSS が掴む `body` のクラスが開閉と一致していることまでである。 */

/* 材料の形は、木を畳む実装から引く。ここは外部 API の形を宣言した層を `import` できない。 */
type TreeJson = Parameters<typeof reduceTree>[0];

const probe = vi.hoisted(() => ({
  slug: 'demo',
  /** URL に載っている検索パラメータ。パネルの開閉はここだけが決める */
  search: {} as ProjectSearch,
  closePanel: vi.fn(),
}));

vi.mock('@tanstack/react-router', () => ({
  createFileRoute: () => (options: unknown) => ({
    options,
    useParams: () => ({ slug: probe.slug }),
    useSearch: () => probe.search,
  }),
  lazyRouteComponent: (load: unknown) => load,
  useNavigate: () => () => undefined,
  Link: ({ children, className }: { children: React.ReactNode; className?: string }) => (
    <a href="/" className={className}>
      {children}
    </a>
  ),
  Outlet: () => <div id="outlet" />,
}));

vi.mock('~/frameworks/tanstack/queries/tree.query.ts', () => ({
  treeQueryKey: ['tree'],
  treeQuery: { queryKey: ['tree'] },
}));

vi.mock('~/frameworks/tanstack/ui/prefs/PrefsContext.tsx', () => ({
  usePrefs: () => ({ dock: true, drawerWidth: null, showAll: false, notify: false, set: () => {} }),
}));

vi.mock('~/frameworks/tanstack/ui/nav/NavContext.tsx', () => ({
  NavProvider: ({ children }: { children: React.ReactNode }) => children,
  useNav: () => ({ closePanel: probe.closePanel }),
}));

/* パネルの中身は、打ち込める要素を並べただけの板に差し替える。会話そのものの読み方は
   ここでは問わない —— 見たいのは、どこで押された `Escape` かで答えが変わることである。 */
vi.mock('~/frameworks/tanstack/ui/components/conversation/ConvPanel.tsx', () => ({
  ConvPanel: () => (
    <div id="panel-body">
      <input id="from" defaultValue="12:00" />
      <textarea id="note" />
      {/* biome-ignore lint/a11y/useSemanticElements: 打ち込める要素として並べているだけの板 */}
      <div id="memo" contentEditable role="textbox" tabIndex={0} suppressContentEditableWarning />
      <select id="span">
        <option>1h</option>
      </select>
      <button type="button" id="in-panel">
        go
      </button>
    </div>
  ),
}));
vi.mock('~/frameworks/tanstack/ui/components/panels/IssueDetail.tsx', () => ({
  IssueDetail: () => <div id="panel-body" />,
}));
vi.mock('~/frameworks/tanstack/ui/components/panels/RefDetailPanel.tsx', () => ({
  RefDetailPanel: () => <div id="panel-body" />,
}));

const { Route } = await import('~/frameworks/tanstack/routes/projects.$slug.tsx');

/* ルートのファイルは、プラグインが `component` を別のチャンクへ切り出す。
   出来上がったルートから辿る — 切り出し先の名前を直に書くと、そちらの都合で壊れる。 */
type SplitComponent = {
  options: { component: () => Promise<{ component: () => React.ReactNode }> };
};
const { component: ProjectLayout } = await (Route as unknown as SplitComponent).options.component();

const AT = '2026-08-09T12:00:00Z';

const tree = (): TreeJson => ({
  generated_at: AT,
  active_threshold_secs: 300,
  sources: { state: 'observed', reason: null },
  processes: { state: 'observed', reason: null },
  complete: true,
  progress: null,
  projects: [
    {
      id: probe.slug,
      slug: probe.slug,
      path: `/w/${probe.slug}`,
      name: probe.slug,
      live_process: false,
      live_process_count: 0,
      tokens_24h: null,
      tokens_24h_state: 'observed',
      read: true,
      sources: { state: 'observed', reason: null },
      sessions: [],
    },
  ],
});

/** 会話のパネルを開いた URL */
const OPENED: ProjectSearch = { panel: 'conv', pv: '/w/demo/s1.jsonl' };

async function draw(search: ProjectSearch, data: TreeJson = tree()) {
  probe.search = search;
  const client = new QueryClient({
    // 問い合わせは走らせない。ここで見るのは、届いた木と打鍵を枠がどう扱うかだけである
    defaultOptions: { queries: { enabled: false, retry: false } },
  });
  client.setQueryData(['tree'], data);
  let container: HTMLElement = document.body;
  // パネルの中身は遅れて読み込まれる。描き終わるまで待たないと、押す先がまだ無い
  await act(async () => {
    container = render(
      <QueryClientProvider client={client}>
        <ProjectLayout />
      </QueryClientProvider>,
    ).container;
  });
  const find = (id: string) => {
    const found = container.querySelector(`#${id}`);
    if (found === null) throw new Error(`#${id} が無い`);
    return found;
  };
  return { container, find, said: container.textContent ?? '' };
}

beforeEach(() => probe.closePanel.mockClear());

describe('パネルを閉じる `Escape`', () => {
  it('パネルの外で押せば閉じる', async () => {
    await draw(OPENED);

    fireEvent.keyDown(document.body, { key: 'Escape' });

    expect(probe.closePanel).toHaveBeenCalledTimes(1);
  });

  it('パネルの中でも、打ち込む先でなければ閉じる', async () => {
    const { find } = await draw(OPENED);

    fireEvent.keyDown(find('in-panel'), { key: 'Escape' });

    expect(probe.closePanel, '閉じるキーはパネルの中からも効く').toHaveBeenCalledTimes(1);
  });

  it.each(['from', 'note', 'span', 'memo'])('打ち込んでいる %s では閉じない', async (id) => {
    const { find } = await draw(OPENED);

    fireEvent.keyDown(find(id), { key: 'Escape' });

    expect(
      probe.closePanel,
      '打っている人には無関係な 2 つのことが、1 打鍵で一度に起きる',
    ).not.toHaveBeenCalled();
  });

  it('`Escape` 以外の打鍵では閉じない', async () => {
    await draw(OPENED);

    fireEvent.keyDown(document.body, { key: 'Enter' });
    fireEvent.keyDown(document.body, { key: 'Esc' });

    expect(probe.closePanel).not.toHaveBeenCalled();
  });

  it('パネルが開いていなければ、何も起きない', async () => {
    await draw({});

    fireEvent.keyDown(document.body, { key: 'Escape' });

    expect(probe.closePanel, '閉じるものが無いのに、閉じる操作だけが走る').not.toHaveBeenCalled();
  });
});

/* 枠は `<Outlet/>` より前に return するので、ここで言い誤ると、それぞれの画面が持っている
   案内はそもそも描かれない。 */
describe('このプロジェクトの行が並んでいないとき、枠が何と言うか', () => {
  const MISSING = 'No project by that name';
  const empty = (over: Partial<TreeJson> = {}): TreeJson => ({ ...tree(), projects: [], ...over });

  it('`~/.claude/projects` を走査できていないなら、そんな名前は無いと言わない', async () => {
    const { said } = await draw(
      {},
      empty({ sources: { state: 'unobservable', reason: 'eacces' } }),
    );

    expect(said, '観測できなかったことの上に、無かったという判定を建てない').not.toContain(MISSING);
    expect(said).toContain('Could not read the transcripts directory');
  });

  it('読み終えたうえで行が無いなら、そんな名前は無いと言う', async () => {
    const { said } = await draw({}, empty());

    expect(said, '読み終えて見当たらないことは、断定できる観測である').toContain(MISSING);
  });

  it('まだ読み終えていないなら、枠を出したまま画面に任せる', async () => {
    const { container, said } = await draw({}, empty({ complete: false }));

    expect(said, 'まだ届いていない行の中に居るかもしれない').not.toContain(MISSING);
    expect(container.querySelector('#outlet')).not.toBeNull();
  });
});

/* 閉じた `#drawer` を滑らせて隠すのも、隠したあいだタブ順から外すのも CSS が決める。
   その CSS が掴んでいるのは `body` のクラス 1 つなので、ここが開閉と食い違えば
   規則そのものが当たらなくなる。 */
describe('パネルの開閉を、`body` のクラスで表に出す', () => {
  it('開いていれば `drawer-open` が付く', async () => {
    await draw(OPENED);

    expect(document.body.classList.contains('drawer-open')).toBe(true);
  });

  it('閉じていれば `drawer-open` は付かない', async () => {
    await draw({});

    expect(document.body.classList.contains('drawer-open')).toBe(false);
  });

  it('指す先の無いパネルも、開いているものとして数える', async () => {
    await draw({ panel: 'conv' });

    expect(
      document.body.classList.contains('drawer-open'),
      '何も選ばずに開いたパネルは、選んでくださいと言うために開いている',
    ).toBe(true);
  });
});
