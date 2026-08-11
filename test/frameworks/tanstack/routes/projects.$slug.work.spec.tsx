import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { ProjectSearch } from '~/frameworks/tanstack/ui/nav/search.ts';

/* Work の画面が、一覧をどこから取ったかを言うか。

   remote を 2 つ以上持つプロジェクトでは、どのリポジトリに尋ねるかを glasshive が名前の順で
   選んでいる。**選んだことを黙ると、選ばなかったほうの課題が「無い」ものとして読まれる。**
   一覧そのものは正しく、行も欠けていないので、黙られたことに気付く手立てが画面に無い。 */

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

const { Route } = await import('~/frameworks/tanstack/routes/projects.$slug.work.tsx');

type SplitComponent = {
  options: { component: () => Promise<{ component: () => React.ReactNode }> };
};
const { component: WorkView } = await (Route as unknown as SplitComponent).options.component();

/* 外部 API が返す一覧の形。ここは外の形を宣言した層を `import` できないので、
   欄は写して持つ。**欄の名前と綴りは `presentIssues` の側で留めてある。** */
const issuesBody = (over: Record<string, unknown> = {}) => ({
  state: 'observed',
  reason: null,
  issues: [],
  counts: { open: 0 },
  truncated: false,
  repository: 'hiroiku/glasshive',
  other_repositories: 0,
  ...over,
});

function draw(body: ReturnType<typeof issuesBody>) {
  probe.search = {};
  const client = new QueryClient({
    // 問い合わせは走らせない。ここで見るのは、届いた答えを画面がどう読むかだけである
    defaultOptions: { queries: { enabled: false, retry: false } },
  });
  client.setQueryData(['tree'], {
    generated_at: '2026-08-09T12:00:00Z',
    active_threshold_secs: 300,
    sources: { state: 'observed', reason: null },
    processes: { state: 'observed', reason: null },
    complete: true,
    progress: null,
    projects: [],
  });
  client.setQueryData(['github-issues', probe.slug, true], { ok: true, body });
  client.setQueryData(['github-issue-events', probe.slug], {
    ok: true,
    body: { state: 'observed', reason: null, issues: [], complete: true },
  });

  const { container } = render(
    <QueryClientProvider client={client}>
      <WorkView />
    </QueryClientProvider>,
  );
  return container.textContent ?? '';
}

describe('一覧をどこから取ったか', () => {
  it('尋ね先が 1 つなら、余計なことを言わない', () => {
    const said = draw(issuesBody());

    expect(said, '選ぶ余地の無いところで断ると、無い迷いを作ることになる').not.toContain(
      'gh repo set-default',
    );
  });

  it('尋ね先を選んだなら、選んだことと選び直し方を言う', () => {
    const said = draw(issuesBody({ other_repositories: 1 }));

    expect(
      said,
      'どちらを見ているのかを言わないと、選ばなかった側の課題が「無い」ことになる',
    ).toContain('hiroiku/glasshive');
    expect(said).toContain('2 GitHub repositories');
    expect(said, '断るだけで選び直せないなら、読んだ人にできることが無い').toContain(
      'gh repo set-default',
    );
  });
});
