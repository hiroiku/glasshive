import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ProjectSearch } from '~/frameworks/tanstack/ui/nav/search.ts';

/* Work の画面が、届いたページをその場で出すか。

   GitHub は 1 ページ 100 件までしか返さない。5 ページぶんの往復が終わるまで行を隠すと、
   **ページ 1 の 100 件が、読み終えるまで「無い」ことになる。** ここで見るのは、1 件でも
   届いたら行が出ることと、まだ途中であることを黙らないことである。

   差し替えるのは `gh` を起こす server function と、行を描くコンポーネントである。
   `streamedQuery` もチャンクの畳み方も本物が走る —— 畳んだ後の 1 枚を置くと、届き方そのものが
   試せない。 */

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
  IssuesLegend: ({ complete }: { complete: boolean }) => (
    <div id="legend" data-complete={String(complete)} />
  ),
}));
vi.mock('~/frameworks/tanstack/ui/components/work/Milestones.tsx', () => ({
  Milestones: () => <div id="milestones" />,
}));

const { getGithubIssuesStream, getGithubIssueEventsStream } = vi.hoisted(() => ({
  getGithubIssuesStream: vi.fn(),
  getGithubIssueEventsStream: vi.fn(),
}));

vi.mock('~/frameworks/tanstack/functions/issues.ts', () => ({
  getGithubIssuesStream,
  getGithubIssueEventsStream,
  getGithubIssues: vi.fn(),
  getGithubIssueEvents: vi.fn(),
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
  kind: 'head',
  head: {
    state: 'observed',
    reason: null,
    issues: [],
    counts: {},
    truncated: false,
    walked: false,
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

function draw(search: ProjectSearch = {}) {
  probe.search = search;
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
  getGithubIssueEventsStream.mockReset();
  getGithubIssueEventsStream.mockImplementation(async function* () {
    yield {
      kind: 'head',
      head: { state: 'observed', reason: null, issues: [], complete: false, walked: false },
    };
    yield { kind: 'complete', complete: true };
  });
});

/** いま出ているバーの名前。どのバーが出ているかで、何を待たせているかが決まる */
const barLabels = (container: HTMLElement) =>
  [...container.querySelectorAll('[role="progressbar"]')].map((bar) =>
    bar.getAttribute('aria-label'),
  );

describe('届いたページから出す', () => {
  it('1 ページ目が届いたら、読み終える前に行を出す', async () => {
    const paging = held();
    getGithubIssuesStream.mockImplementation(() => paging.stream());

    const { container } = draw();

    await waitFor(() => expect(container.querySelector('#issues')).not.toBeNull());
    expect(
      barLabels(container),
      '届いた行を隠して待たせると、ページ 1 の 100 件が読み終えるまで無いことになる',
    ).not.toContain('Fetching issues from GitHub');

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

  /* 最初の 1 枚は尋ね先を言うだけで、行を 1 つも持たない。**そこを一覧として出さない** ——
     出すと、届く前の画面が「課題が 1 件も無い repository」として読める。 */
  it('尋ね先だけが決まったところは、まだ一覧ではない', async () => {
    /* 1 枚目が畳まれたところで留める。**待たずに測ると、届く前の画面を測ってしまう** ——
       届く前も同じバーが出ているので、そちらを見ている限りこの回は何も確かめていない。 */
    let arrived: () => void = () => {};
    const landed = new Promise<void>((resolve) => {
      arrived = resolve;
    });
    getGithubIssuesStream.mockImplementation(async function* () {
      yield head;
      arrived();
      await new Promise(() => {});
    });

    const { container } = draw();
    await landed;
    /* 畳んだ結果が画面へ出るのを待つ。**マイクロタスクだけでは足りない** ——
       問い合わせの通知はタイマーで束ねられるので、そこを跨がないと届く前の画面を測る。 */
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(barLabels(container)).toContain('Fetching issues from GitHub');
    expect(
      container.querySelector('#issues'),
      '行の無い表は、課題の無い一覧として読める',
    ).toBeNull();
  });

  /* 依存を採り切れたかは、一覧を歩き終えて初めて言える。**届いたぶんの `deps_complete` で
     言わない** —— まだ届いていない課題への弧は落ちているので、足りない絵が正しい絵として出る。 */
  it('依存を採り切ったことも、歩き終えてから言う', async () => {
    const paging = held();
    getGithubIssuesStream.mockImplementation(() => paging.stream());

    const { container } = draw();

    await waitFor(() => expect(container.querySelector('#legend')).not.toBeNull());
    expect(
      container.querySelector('#legend')?.getAttribute('data-complete'),
      '足りない弧の絵が、採り切った絵として出る',
    ).toBe('false');

    paging.release();
    await waitFor(() =>
      expect(container.querySelector('#legend')?.getAttribute('data-complete')).toBe('true'),
    );
  });

  /* 全部が揃って初めて成り立つ導出は、届いたぶんでは組めない。**依存の弧も、着手順の束も、
     マイルストーンの束も、まだ届いていない課題のぶんが黙って落ちる** —— 堰き止められている
     課題が `Ready now` に並び、まだ届いていないマイルストーンが「無い」になる。 */
  it.each([
    ['依存の絵', { view: 'graph' } as ProjectSearch, '#dep'],
    ['マイルストーンの束', { unit: 'milestones' } as ProjectSearch, '#milestones'],
    ['着手順の束', { sort: 'start' } as ProjectSearch, '#issues'],
  ])('%s は、歩き終えるまで組まない', async (_name, search, selector) => {
    const paging = held();
    getGithubIssuesStream.mockImplementation(() => paging.stream());

    const { container } = draw(search);

    await waitFor(() =>
      expect(barLabels(container)).toContain('Fetching the rest of the issues from GitHub'),
    );
    expect(
      container.querySelector(selector),
      '届いたぶんだけで組むと、まだ届いていない課題が「何も堰き止めていない」ことになる',
    ).toBeNull();

    paging.release();
    await waitFor(() => expect(container.querySelector(selector)).not.toBeNull());
  });

  /* 累積フローは全件を数え上げた曲線である。**届いたぶんで描かない** —— ページが届くたびに
     曲線が伸び、その途中のどれもが「この時点で在った課題の数」としては嘘である。 */
  it('累積フローも、歩き終えるまで描かない', async () => {
    const paging = held();
    getGithubIssuesStream.mockImplementation(() => paging.stream());

    const { container } = draw();

    await waitFor(() => expect(container.querySelector('#issues')).not.toBeNull());
    expect(container.querySelector('#flow'), '途中の曲線が、全件の曲線として読まれる').toBeNull();

    paging.release();
    await waitFor(() => expect(container.querySelector('#flow')).not.toBeNull());
  });

  /* 切り替えの脇の数も同じである。**途中の数を数として出さない** —— 数はそこで確定した
     ものとして読まれるので、増えていく数を置くと、切り替える必要が無いように読める。 */
  it('切り替えの件数も、歩き終えるまで言い切らない', async () => {
    const paging = held();
    getGithubIssuesStream.mockImplementation(() => paging.stream());

    const { container } = draw();

    await waitFor(() => expect(container.querySelector('#issues')).not.toBeNull());
    const unit = (name: string) =>
      [...container.querySelectorAll('.unit-switch button')]
        .map((button) => button.textContent ?? '')
        .find((text) => text.startsWith(name));

    expect(unit('Issues'), '途中の 1 件を数として出すと、届くたびに数がちらつく').toBe('Issues—');

    paging.release();
    await waitFor(() => expect(unit('Issues')).toBe('Issues2'));
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
    expect(chipOf('+ closed'), '数え終えていない 0 は、閉じた課題が無いという断定になる').toBe(
      '+ closed —',
    );

    paging.release();
    await waitFor(() => expect(chipOf('open')).toBe('open 2'));
    expect(chipOf('+ closed')).toBe('+ closed 0');
  });
});
