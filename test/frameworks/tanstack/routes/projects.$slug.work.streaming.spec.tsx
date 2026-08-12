import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ProjectSearch } from '~/frameworks/tanstack/ui/nav/search.ts';

/* Work の画面が、届いたページをその場で出すか。

   GitHub は 1 ページ 100 件までしか返さない。5 ページぶんの往復が終わるまで行を隠すと、
   **ページ 1 の 100 件が、読み終えるまで「無い」ことになる。** ここで見るのは、1 件でも
   届いたら行が出ることと、まだ途中であることを黙らないことである。

   問い合わせは本物を通す。差し替えるのは `gh` を起こす server function だけで、`streamedQuery`
   もチャンクの畳み方も本物が走る —— 畳んだ後の 1 枚を置くと、届き方そのものが試せない。 */

const probe = vi.hoisted(() => ({ slug: 'demo', search: {} as ProjectSearch }));

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

vi.mock('~/frameworks/tanstack/ui/nav/NavContext.tsx', () => ({
  useNav: () => ({
    openIssue: () => undefined,
    openRef: () => undefined,
    gotoMilestone: () => undefined,
  }),
}));

/* 行の中身はここでは問わない。**断りは表の外に出る**ので、表そのものは板でよい。 */
vi.mock('~/frameworks/tanstack/ui/components/issues/IssuesTable.tsx', () => ({
  IssuesTable: () => <div id="issues" />,
}));
vi.mock('~/frameworks/tanstack/ui/components/issues/DependencyGraph.tsx', () => ({
  DependencyGraph: () => <div id="dep" />,
}));
vi.mock('~/frameworks/tanstack/ui/components/issues/FlowChart.tsx', () => ({
  FlowChart: () => <div id="flow" />,
}));
vi.mock('~/frameworks/tanstack/ui/components/issues/Legend.tsx', () => ({
  IssuesLegend: () => <div id="legend" />,
}));

const { getGithubIssuesStream, getGithubIssueEvents } = vi.hoisted(() => ({
  getGithubIssuesStream: vi.fn(),
  getGithubIssueEvents: vi.fn(),
}));

vi.mock('~/frameworks/tanstack/functions/issues.ts', () => ({
  getGithubIssuesStream,
  getGithubIssueEvents,
  getGithubIssues: vi.fn(),
  getGithubIssueBody: vi.fn(),
  getGithubIssueDiscussion: vi.fn(),
}));

const { Route } = await import('~/frameworks/tanstack/routes/projects.$slug.work.tsx');

type SplitComponent = {
  options: { component: () => Promise<{ component: () => React.ReactNode }> };
};
const { component: WorkView } = await (Route as unknown as SplitComponent).options.component();

/** 尋ね先が決まったことを言う 1 枚。行はまだ 1 つも無い */
const head = {
  kind: 'issues',
  issues: {
    state: 'observed',
    reason: null,
    issues: [],
    counts: {},
    truncated: false,
    repository: 'hiroiku/glasshive',
    other_repositories: 0,
  },
};

/** 課題 1 件。ここで見るのは届き方だけなので、行に出る欄しか持たせない */
const issue = (id: string) => ({
  id,
  title: `issue ${id}`,
  status: 'open',
  issue_type: null,
  labels: [],
  assignee: null,
  created_at: '2026-08-09T12:00:00Z',
  updated_at: '2026-08-09T12:00:00Z',
  closed_at: null,
  deps: [],
  deps_complete: true,
  github: null,
});

/** 好きなときに次のページを流せるストリーム。止めたところで `fetching` のまま留まる */
function held() {
  let release: () => void = () => {};
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  async function* stream() {
    yield head;
    yield { kind: 'page', issues: [issue('#1')], counts: { open: 1 } };
    await gate;
    yield { kind: 'page', issues: [issue('#2')], counts: { open: 1 } };
    yield { kind: 'complete', truncated: false };
  }
  return { stream, release };
}

function draw() {
  probe.search = {};
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  client.setQueryData(['tree'], {
    generated_at: '2026-08-09T12:00:00Z',
    active_threshold_secs: 300,
    sources: { state: 'observed', reason: null },
    processes: { state: 'observed', reason: null },
    complete: true,
    progress: null,
    projects: [],
  });
  return render(
    <QueryClientProvider client={client}>
      <WorkView />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  getGithubIssuesStream.mockReset();
  getGithubIssueEvents.mockReset();
  getGithubIssueEvents.mockResolvedValue({
    ok: true,
    body: { state: 'observed', reason: null, issues: [], complete: true },
  });
});

describe('届いたページから出す', () => {
  it('1 ページ目が届いたら、読み終える前に行を出す', async () => {
    const paging = held();
    getGithubIssuesStream.mockImplementation(() => paging.stream());

    const { container } = draw();

    await waitFor(() => expect(container.querySelector('#issues')).not.toBeNull());
    expect(
      container.querySelector('.rp-track'),
      '届いた行を隠して待たせると、ページ 1 の 100 件が読み終えるまで無いことになる',
    ).toBeNull();

    paging.release();
    await waitFor(() => expect(getGithubIssuesStream).toHaveBeenCalledTimes(1));
  });

  /* 1 件も届いていないあいだは、行を出す先が無い。**そこは空の一覧にしない** ——
     まだ読んでいないことと、課題が 1 件も無いことは別である。 */
  it('1 ページも届いていないあいだは、読んでいることを言う', async () => {
    getGithubIssuesStream.mockImplementation(async function* () {
      await new Promise(() => {});
    });

    const { container } = draw();

    await waitFor(() =>
      expect(container.querySelector('[role="progressbar"]')?.getAttribute('aria-label')).toBe(
        'Fetching issues from GitHub',
      ),
    );
    expect(
      container.querySelector('#issues'),
      '行の無い表は、課題の無い一覧として読める',
    ).toBeNull();
  });

  /* 件数はそこで数え終えたものとして読まれる。**途中の数を数として出さない** ——
     ページが届くたびに増える数を置くと、`open 40` を見た人が 40 件だと思う。 */
  it('読み終えるまで、件数を言い切らない', async () => {
    const paging = held();
    getGithubIssuesStream.mockImplementation(() => paging.stream());

    const { container } = draw();

    await waitFor(() => expect(container.querySelector('#issues')).not.toBeNull());
    const chipOf = (name: string) =>
      [...container.querySelectorAll('.fchip')]
        .map((chip) => chip.textContent ?? '')
        .find((text) => text.startsWith(name));

    expect(chipOf('open'), '途中の 1 件を数として出すと、届くたびに数がちらつく').toBe('open —');

    paging.release();
    await waitFor(() => expect(chipOf('open')).toBe('open 2'));
  });
});
