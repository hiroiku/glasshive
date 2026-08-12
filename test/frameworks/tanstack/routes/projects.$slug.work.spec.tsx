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

/** `~/.claude/projects` の走査。既定は歩けたことにする */
const treeSources = (state: string, reason: string | null = null) => ({ state, reason });

/** 手元の git の答え。渡さなければ、まだ届いていないことになる */
type GitAnswer = { ok: boolean; body?: Record<string, unknown> };

function draw(
  body: ReturnType<typeof issuesBody>,
  sources = treeSources('observed'),
  search: ProjectSearch = {},
  gitAnswer?: GitAnswer,
) {
  probe.search = search;
  const client = new QueryClient({
    // 問い合わせは走らせない。ここで見るのは、届いた答えを画面がどう読むかだけである
    defaultOptions: { queries: { enabled: false, retry: false } },
  });
  if (gitAnswer !== undefined) client.setQueryData(['git', probe.slug], gitAnswer);
  client.setQueryData(['tree'], {
    generated_at: '2026-08-09T12:00:00Z',
    active_threshold_secs: 300,
    sources,
    processes: { state: 'observed', reason: null },
    complete: true,
    progress: null,
    projects: [],
  });
  /* 一覧はページごとに届くので、置くのは畳んだ後の 1 枚である。`ApiResponse` では包まない */
  client.setQueryData(['github-issues', probe.slug, true], body);
  /* 記録もページごとに届くので、置くのは畳んだ後の 1 枚である */
  client.setQueryData(['github-issue-events', probe.slug], {
    state: 'observed',
    reason: null,
    issues: [],
    complete: true,
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

/* 課題は GitHub から読めていて、読めていないのは `transcript` のほうである。
   画面はほとんど埋まるので、言わないとエージェントの空欄だけが観測の顔で残る。 */
describe('エージェントの欄が空である理由', () => {
  it('`transcript` を歩けていれば、空欄に断りを付けない', () => {
    const said = draw(issuesBody());

    expect(said).not.toContain('the transcripts could not be read');
  });

  it('`transcript` を歩けていなければ、空欄が観測でないことを言う', () => {
    const said = draw(issuesBody(), treeSources('unobservable', 'transcripts.unreadable'));

    expect(said, '空欄を黙って出すと、誰も触っていないことになる').toContain(
      'the transcripts could not be read',
    );
  });

  /* ディレクトリが無かったことは失敗ではない。`absent` の 0 は断定してよい観測である。 */
  it('走査する先が無かったのなら、読めなかったとは言わない', () => {
    const said = draw(issuesBody(), treeSources('absent', 'no-source'));

    expect(said).not.toContain('the transcripts could not be read');
  });

  it('ブランチの単位でも同じことを言う', () => {
    const said = draw(issuesBody(), treeSources('unobservable', 'transcripts.unreadable'), {
      unit: 'branches',
    });

    expect(said).toContain('the transcripts could not be read');
  });
});

/* 切り替えに添える件数。**読みに行けていないことを 0 で表さない。**

   0 は「向こうに 1 件も無い」という断定である。手元の git を読めていないときにそれを出すと、
   ブランチが 1 本も無いプロジェクトと同じ画面になり、切り替える理由が消える。
   git のリポジトリでないディレクトリの 0 は、観測して言える事実なので 0 のままにする。 */
describe('ブランチの件数', () => {
  const countsOf = (said: string) =>
    said.slice(said.indexOf('Branches'), said.indexOf('Branches') + 12);

  it('観測できていれば、その本数を出す', () => {
    const said = draw(
      issuesBody(),
      treeSources('observed'),
      {},
      {
        ok: true,
        body: {
          state: 'observed',
          reason: null,
          base: 'main',
          worktrees: [],
          branches: [],
          mainline: [],
          mainline_truncated: false,
          tips: [{ name: 'feat/x', kind: 'branch', ahead: 0, behind: 0, worktree: null }],
          conflicts: [],
        },
      },
    );

    expect(countsOf(said)).toContain('1');
  });

  it('git のリポジトリでなければ、0 と言い切る', () => {
    const said = draw(
      issuesBody(),
      treeSources('observed'),
      {},
      {
        ok: true,
        body: {
          state: 'absent',
          reason: 'no-source',
          base: '',
          worktrees: [],
          branches: [],
          mainline: [],
          mainline_truncated: false,
          tips: [],
          conflicts: [],
        },
      },
    );

    expect(countsOf(said), '観測して言える 0 まで隠すと、言えることが言えなくなる').toContain('0');
  });

  it('読めなかったなら、0 ではなく読めなかったと言う', () => {
    const said = draw(issuesBody(), treeSources('observed'), {}, { ok: false });

    expect(
      countsOf(said),
      '0 と出すと、ブランチが 1 本も無いプロジェクトと同じ画面になる',
    ).toContain('?');
  });

  it('まだ届いていないなら、読めなかったのとは別の絵で出す', () => {
    const said = draw(issuesBody());

    expect(countsOf(said), '待てば揃うのと、待っても揃わないのを同じ絵にしない').toContain('—');
  });
});
