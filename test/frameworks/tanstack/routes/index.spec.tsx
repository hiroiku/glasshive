import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { reduceTree } from '~/frameworks/tanstack/queries/tree.query.ts';
import type { deriveRows } from '~/frameworks/tanstack/ui/derive/overview.ts';

/* 材料の形は、木を畳む実装と行を起こす実装から引く。
   ここは外部 API の形を宣言した層を `import` できない。 */
type TreeJson = Parameters<typeof reduceTree>[0];
type ProjectJson = Parameters<typeof deriveRows>[0][number];
type SessionJson = ProjectJson['sessions'][number];

/* 一覧は触っているあいだ並びを止める。狙って押した行が、変更通知の届いた瞬間に動くのを防ぐため。

   **止める入口と解く出口は対になっていなければならない。** focus で止めて mouse でしか
   解けないと、キーボードだけで表に入ったユーザーの並びは二度と直らず、しかも止まっている
   ことは画面のどこにも出ない。ここで見るのはその対である。 */

vi.mock('@tanstack/react-router', () => ({
  createFileRoute: () => (options: unknown) => ({ options }),
  lazyRouteComponent: (load: unknown) => load,
  Link: ({ children, className }: { children: React.ReactNode; className?: string }) => (
    <a href="/" className={className}>
      {children}
    </a>
  ),
}));

vi.mock('~/frameworks/tanstack/queries/tree.query.ts', () => ({
  treeQueryKey: ['tree'],
  treeQuery: { queryKey: ['tree'] },
}));
vi.mock('~/frameworks/tanstack/queries/preferences.query.ts', () => ({
  preferencesQueryKey: ['preferences'],
  preferencesQuery: { queryKey: ['preferences'] },
}));
vi.mock('~/frameworks/tanstack/ui/hooks/useTabSelection.ts', () => ({
  useTabSelection: () => ({
    visibleTabs: [],
    watched: new Set<string>(),
    candidates: [],
    storedState: 'observed',
    toggleWatch: () => undefined,
    moveWatch: () => undefined,
    error: null,
  }),
}));

const { Route } = await import('~/frameworks/tanstack/routes/index.tsx');

/* ルートのファイルは、プラグインが `component` を別のチャンクへ切り出す。
   出来上がったルートから辿る — 切り出し先の名前を直に書くと、そちらの都合で壊れる。 */
type SplitComponent = {
  options: { component: () => Promise<{ component: () => React.ReactNode }> };
};
const { component: Overview } = await (Route as unknown as SplitComponent).options.component();

const AT = '2026-08-09T12:00:00Z';

const session = (over: Partial<SessionJson> = {}): SessionJson => ({
  id: 's1',
  file: '/x/s1.jsonl',
  title: null,
  state: 'ended',
  awaiting: null,
  started: AT,
  last_activity: AT,
  tokens: null,
  tokens_state: 'observed',
  model: null,
  effort: null,
  git_branch: null,
  cwd: null,
  issues: [],
  current: null,
  intervals: [],
  intervals_complete: true,
  intervals_state: 'observed',
  size: 0,
  sources: { state: 'observed', reason: null },
  subagents: [],
  ...over,
});

const project = (id: string, sessions: SessionJson[]): ProjectJson => ({
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
  sessions,
});

/** `quiet` は何も動いておらず、`busy` は動いている。既定の並びでは `busy` が上に来る */
const treeOf = (quietAwaiting: SessionJson['awaiting']): TreeJson => ({
  generated_at: AT,
  active_threshold_secs: 300,
  sources: { state: 'observed', reason: null },
  processes: { state: 'observed', reason: null },
  complete: true,
  progress: null,
  projects: [
    project('quiet', [session({ awaiting: quietAwaiting })]),
    project('busy', [session({ state: 'active' })]),
  ],
});

function draw(initial: TreeJson = treeOf(null)) {
  const client = new QueryClient({
    // 問い合わせは走らせない。ここで確かめるのは、届いた木を画面がどう並べるかだけである
    defaultOptions: { queries: { enabled: false, retry: false } },
  });
  client.setQueryData(['tree'], initial);
  const { container } = render(
    <QueryClientProvider client={client}>
      <Overview />
    </QueryClientProvider>,
  );
  const names = () =>
    [...container.querySelectorAll('.dash-row .dash-name')].map((row) => row.textContent);
  const dash = container.querySelector('#dash');
  if (dash === null) throw new Error('#dash が無い');
  /* 変更通知が届いて `quiet` が人待ちになったことにする。止めていなければ、
     ここで `quiet` が先頭へ上がる。

     キャッシュの入れ替えを画面へ知らせるのはタイマー越しなので、1 度譲ってから読む。 */
  const arrive = async () => {
    await act(async () => {
      client.setQueryData(['tree'], treeOf('user'));
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  };
  return { container, dash, names, arrive };
}

/* 走査できなかったプロジェクトは行として残るが、数はどれも欠けている。
   行の欄だけで言うと、一覧を上から眺めている人には届かない。 */
describe('数え上げられなかったプロジェクトを、画面が黙らない', () => {
  const withClosed = (): TreeJson => ({
    ...treeOf(null),
    projects: [
      project('busy', [session({ state: 'active' })]),
      {
        ...project('closed', []),
        sources: { state: 'unobservable', reason: 'eacces' },
      },
    ],
  });

  it('走査できなかった行が在ることを、一覧の上で言う', () => {
    const { container } = draw(withClosed());

    const warned = [...container.querySelectorAll('.warn')].map((found) => found.textContent);
    expect(warned.some((said) => said?.includes('could not be read'))).toBe(true);
  });

  it('どれも走査できていれば、何も言わない', () => {
    const { container } = draw();

    expect(
      container.querySelector('.warn'),
      '読めているのに警告を出すと、本当に読めなかったときに読み飛ばされる',
    ).toBeNull();
  });

  it('走査できなかった行の点を塗らない', () => {
    const { container } = draw(withClosed());
    const rows = [...container.querySelectorAll('.dash-row .dash-name')];
    const closed = rows.find((row) => row.textContent?.includes('closed'));

    expect(
      closed?.querySelector('.dot.unknown'),
      '`ended` の点は「このプロジェクトでは何も動いていない」という断定である',
    ).not.toBeNull();
  });
});

describe('触っているあいだ、一覧の並びを止める', () => {
  it('何も触っていなければ、届いたとおりに並べ直す', async () => {
    const { names, arrive } = draw();
    expect(names()).toEqual(['busy', 'quiet']);

    await arrive();

    expect(names(), '人待ちのプロジェクトが先頭へ来る').toEqual(['quiet', 'busy']);
  });

  it('キーボードで表に入ったら止める', async () => {
    const { dash, names, arrive } = draw();

    fireEvent.focusIn(dash);
    await arrive();

    expect(names(), '狙って押した行が、押す瞬間に動くのを防ぐ').toEqual(['busy', 'quiet']);
  });

  it('focus が表の外へ出たら解く', async () => {
    const { dash, names, arrive } = draw();

    fireEvent.focusIn(dash);
    await arrive();
    fireEvent.focusOut(dash, { relatedTarget: document.body });

    expect(
      names(),
      'マウスを使わないユーザーの並びが、この画面に居るあいだ二度と直らなくなる',
    ).toEqual(['quiet', 'busy']);
  });

  it('表の中で focus が移っただけなら、止めたままにする', async () => {
    const { container, dash, names, arrive } = draw();
    const inside = container.querySelector('.dash-row .pin');
    if (inside === null) throw new Error('行の中に focus できるものが無い');

    fireEvent.focusIn(dash);
    await arrive();
    fireEvent.focusOut(dash, { relatedTarget: inside });

    expect(names(), '行から行へ送るあいだに並びが動くと、押す先が変わる').toEqual([
      'busy',
      'quiet',
    ]);
  });
});
