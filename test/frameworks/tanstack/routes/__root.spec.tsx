import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

/* 上端バーそのものを描くための下ごしらえ。ルーターも SSE も好みの保存先も、ここで見たい
   ものには関わらない。**木だけを本物のまま渡す** —— 数えるのも、数え終えていないことを
   言うのも、木から決まる。 */
/* いま居る URL。既定は検索パラメータの無い Overview で、1 つのディレクトリを開いた枠は
   `only` が載っているときだけ描かれる。 */
const { url } = vi.hoisted(() => ({
  url: { search: {} as Record<string, unknown>, match: false as false | { slug: string } },
}));

vi.mock('@tanstack/react-router', () => ({
  createRootRouteWithContext: () => (options: unknown) => ({ options }),
  HeadContent: () => null,
  Scripts: () => null,
  Outlet: () => null,
  Link: ({ children, ...rest }: { children: React.ReactNode }) => (
    <a href="/" {...rest}>
      {children}
    </a>
  ),
  useMatchRoute: () => () => url.match,
  useNavigate: () => () => undefined,
  useSearch: () => url.search,
}));

vi.mock('~/frameworks/tanstack/queries/tree.query.ts', () => ({
  treeQueryKey: ['tree'],
  treeQuery: {
    queryKey: ['tree'],
    // 木は問い合わせずに置く。取りに行き始めたら、それはここで見たいものが変わっている
    queryFn: () => {
      throw new Error('木は取りに行かない');
    },
  },
}));

vi.mock('~/frameworks/tanstack/ui/hooks/useChangeStream.ts', () => ({
  useChangeStream: () => ({ connected: true, watching: true }),
  subscribeToFile: () => () => undefined,
}));

vi.mock('~/frameworks/tanstack/ui/hooks/useTabSelection.ts', () => ({
  useTabSelection: () => ({
    selection: { version: 1, mode: 'all', watched: [], hidden: [] },
    visibleTabs: [],
    watched: new Set<string>(),
    storedState: 'observed',
    toggleWatch: () => undefined,
    moveWatch: () => undefined,
    error: null,
  }),
}));

vi.mock('~/frameworks/tanstack/queries/target.query.ts', () => ({
  targetQueryKey: ['target'],
  targetQuery: {
    queryKey: ['target'],
    // 名指された相手も問い合わせずに置く。取りに行き始めたら、それはここで見たいものが変わっている
    queryFn: () => {
      throw new Error('名指された相手は取りに行かない');
    },
  },
}));

import { ConnStatus, countsOf, Route } from '~/frameworks/tanstack/routes/__root.tsx';

afterEach(() => {
  url.search = {};
  url.match = false;
});

/* 材料の形は、数える実装そのものから引く。ここは外部 API の形を宣言した層を `import` できない。 */
type TreeJson = NonNullable<Parameters<typeof countsOf>[0]>;
type ProjectJson = TreeJson['projects'][number];
type SessionJson = ProjectJson['sessions'][number];

/* 上端バーは、画面の中でいちばん目に入る数と、更新が届いているかを出す 2 つだけを持つ。

   **どちらも「言えないこと」を持っている。** 読み終えていない木から数えた 0 は
   「待っている人は居ない」ではないし、SSE が開いていることは更新が届くことではない。
   ここで見るのは、その言えない側が画面に残るかである。 */

const AT = '2026-08-09T12:00:00Z';

const session = (over: Partial<SessionJson> = {}): SessionJson => ({
  id: 's1',
  file: '/x/s1.jsonl',
  title: null,
  state: 'active',
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

const project = (over: Partial<ProjectJson> = {}): ProjectJson => ({
  id: '-w-alpha',
  slug: '-w-alpha',
  path: '/w/alpha',
  name: 'alpha',
  live_process: false,
  live_process_count: 0,
  tokens_24h: null,
  tokens_24h_state: 'observed',
  read: true,
  sources: { state: 'observed', reason: null },
  sessions: [session()],
  ...over,
});

const tree = (over: Partial<TreeJson> = {}): TreeJson => ({
  generated_at: AT,
  active_threshold_secs: 300,
  sources: { state: 'observed', reason: null },
  processes: { state: 'observed', reason: null },
  complete: true,
  progress: null,
  projects: [project()],
  ...over,
});

describe('上端バーの数', () => {
  it('読み終えた木の数は、そのまま断定してよい', () => {
    const counts = countsOf(
      tree({
        projects: [
          project({ sessions: [session({ state: 'active' }), session({ state: 'ended' })] }),
          project({ id: '-w-beta', sessions: [session({ state: 'waiting', awaiting: 'user' })] }),
        ],
      }),
    );

    expect(counts).toEqual({
      active: 1,
      waiting: 1,
      ended: 1,
      input: 1,
      partial: false,
      unreadable: false,
    });
  });

  /* 走査できなかったプロジェクトの行は一覧に残り、`read: true` / `sessions: []` で
     読み終える。**そこで数えた 0 は観測ではない。** */
  it('走査できなかったプロジェクトの 0 を、数え終えた 0 として断定しない', () => {
    const counts = countsOf(
      tree({
        projects: [
          project({ sessions: [session({ state: 'active' })] }),
          project({
            id: '-w-closed',
            sources: { state: 'unobservable', reason: 'eacces' },
            sessions: [],
          }),
        ],
      }),
    );

    expect(counts.active, '見えたぶんは本当に在るので足す').toBe(1);
    expect(counts.partial, '足りないことを黙ると、待っている人が居ないことになる').toBe(true);
    expect(
      counts.unreadable,
      '読んでいる途中なら待てば揃うが、こちらは待っても揃わない。同じ文で伝えない',
    ).toBe(true);
  });

  it('読み終えていないだけのプロジェクトは、読めなかったことにしない', () => {
    const counts = countsOf(
      tree({ complete: false, projects: [project({ read: false, sessions: [] })] }),
    );

    expect(counts.partial).toBe(true);
    expect(counts.unreadable, 'まだ読んでいないだけで、読めなかったわけではない').toBe(false);
  });

  it('まだ読んでいないプロジェクトが残っているあいだは、断定しない', () => {
    const counts = countsOf(
      tree({
        complete: false,
        projects: [project({ id: '-w-beta', read: false, sessions: [] })],
      }),
    );

    expect(counts.active, '読んでいない行は数に足さない').toBe(0);
    expect(
      counts.partial,
      '足さなかったことを黙ると、途中の 0 が「待っている人は居ない」として読まれる',
    ).toBe(true);
  });

  it('`~/.claude/projects` を走査できなかったときも、0 と断定しない', () => {
    const counts = countsOf(
      tree({ sources: { state: 'unobservable', reason: 'eacces' }, projects: [] }),
    );

    expect(counts.partial, '観測できなかったことを「無かった」と書き換えない').toBe(true);
  });

  it('ディレクトリが無かったときは、0 と言い切る', () => {
    const counts = countsOf(
      tree({ sources: { state: 'absent', reason: 'no-source' }, projects: [] }),
    );

    expect(counts.partial, '無かったことは断定できる観測である').toBe(false);
  });

  it('木が届く前は断定しない', () => {
    expect(countsOf(undefined).partial).toBe(true);
  });
});

/* 数え終えていないことは、数の隣に出て初めてユーザーに届く。`countsOf` が `partial` を
   返していても、上端バーがそれを黙れば、途中の 0 が数え終えた 0 として読まれる。 */
describe('数え終えていないことを、上端バーが言う', () => {
  const Chrome = (Route as unknown as { options: { component: () => React.ReactNode } }).options
    .component;

  /** まだ読んでいるプロジェクトが残っている木。1 つは読み終えていて、1 つはまだである */
  const stillReading = (): TreeJson =>
    tree({
      complete: false,
      projects: [
        project({ sessions: [session({ state: 'active' })] }),
        project({ id: '-w-beta', read: false, sessions: [] }),
      ],
    });

  /** 走査できなかったプロジェクトが混ざった木。行は残るが、そこの数はどこにも無い */
  const withUnreadable = (): TreeJson =>
    tree({
      projects: [
        project({ sessions: [session({ state: 'active' })] }),
        project({
          id: '-w-closed',
          sources: { state: 'unobservable', reason: 'eacces' },
          sessions: [],
        }),
      ],
    });

  const draw = (data: TreeJson) => {
    const client = new QueryClient({
      // 問い合わせは走らせない。ここで見るのは、届いた木を上端バーがどう出すかだけである
      defaultOptions: { queries: { enabled: false, retry: false } },
    });
    client.setQueryData(['tree'], data);
    const { container } = render(
      <QueryClientProvider client={client}>
        <Chrome />
      </QueryClientProvider>,
    );
    const counts = container.querySelector('#counts');
    if (counts === null) throw new Error('#counts が無い');
    const marks = [...counts.querySelectorAll('.dimtxt')];
    return {
      text: (counts.textContent ?? '').replace(/\s+/g, ' ').trim(),
      marks,
      titles: marks.map((mark) => mark.getAttribute('title')),
    };
  };

  it('読み終えていないプロジェクトが残っているあいだは、どの数にも `+?` を添える', () => {
    const { text, titles } = draw(stillReading());

    expect(text, '途中の数を数え終えた数と同じ顔で出すと、待っている人が居ないことになる').toBe(
      'active 1+? / waiting 0+? / ended 0+?',
    );
    expect(titles, 'どれか 1 つに添えても、残りは数え終えた数として読まれる').toEqual([
      'Counted from the projects read so far',
      'Counted from the projects read so far',
      'Counted from the projects read so far',
    ]);
  });

  it('走査できなかったプロジェクトが在るときも、どの数にも `+?` を添える', () => {
    const { text, titles } = draw(withUnreadable());

    expect(text).toBe('active 1+? / waiting 0+? / ended 0+?');
    expect(titles).toEqual([
      'Some projects could not be read — the count may be short',
      'Some projects could not be read — the count may be short',
      'Some projects could not be read — the count may be short',
    ]);
  });

  it('待てば揃うのと、待っても揃わないのを、別の文で言う', () => {
    const reading = draw(stillReading()).titles[0] ?? '';
    const unreadable = draw(withUnreadable()).titles[0] ?? '';

    expect(
      unreadable,
      '同じ文で伝えると、走査できなかったプロジェクトを、ユーザーはいつまでも待つことになる',
    ).not.toBe(reading);
  });

  it('読み終えた木の数には、何も添えない', () => {
    const { text, marks } = draw(
      tree({
        projects: [
          project({
            sessions: [
              session({ state: 'active' }),
              session({ state: 'waiting', awaiting: 'user' }),
            ],
          }),
        ],
      }),
    );

    expect(text).toBe('active 1 / waiting 1 / input 1 / ended 0');
    expect(marks, '断定してよい数にまで添えると、`+?` は誰にも読まれなくなる').toHaveLength(0);
  });
});

/* ディレクトリを名指して開いたときの枠。

   **タブ行は Overview のものである。** 出したままにすると、そこに並ぶのは開いていない
   プロジェクトばかりになる。数も同じで、このウィンドウに出ていないセッションを足すと、
   画面のどこを探しても見つからない待ちが上端バーに出る。 */
describe('1 つのディレクトリを開いたウィンドウ', () => {
  const Chrome = (Route as unknown as { options: { component: () => React.ReactNode } }).options
    .component;

  const twoProjects = (): TreeJson =>
    tree({
      projects: [
        project({ sessions: [session({ state: 'active' })] }),
        project({
          id: '-w-beta',
          name: 'beta',
          path: '/w/beta',
          sessions: [session({ state: 'waiting', awaiting: 'user' })],
        }),
      ],
    });

  const draw = (data: TreeJson) => {
    const client = new QueryClient({
      defaultOptions: { queries: { enabled: false, retry: false } },
    });
    client.setQueryData(['tree'], data);
    client.setQueryData(['target'], {
      requested_path: '/w/alpha',
      root_path: '/w/alpha',
      name: 'alpha',
      project_id: '-w-alpha',
      siblings: [{ id: '-w-beta', name: 'beta', path: '/w/beta' }],
    });
    const { container } = render(
      <QueryClientProvider client={client}>
        <Chrome />
      </QueryClientProvider>,
    );
    return container;
  };

  it('タブ行を出さず、開いているリポジトリを出す', () => {
    url.search = { only: true };
    url.match = { slug: '-w-alpha' };

    const container = draw(twoProjects());

    expect(
      container.querySelector('#tabs'),
      'このウィンドウの外にしか行き先の無いタブが並ぶ',
    ).toBeNull();
    const here = container.querySelector('#here');
    expect(here?.textContent, 'どのリポジトリを開いているかが、どこにも出ていない').toContain(
      'alpha',
    );
    expect(here?.querySelector('.here-path')?.textContent).toBe('/w/alpha');
  });

  /* 1 つのリポジトリは複数のプロジェクトに割れている。開いたのが割れた片方であることを
     黙ると、隣で動いているセッションが「無かった」ものとして読まれる。 */
  it('同じリポジトリに居るほかのプロジェクトを、押せる形で並べる', () => {
    url.search = { only: true };
    url.match = { slug: '-w-alpha' };

    const links = [...draw(twoProjects()).querySelectorAll('#here .here-sib')];

    expect(links.map((link) => link.textContent)).toEqual(['beta']);
  });

  it('数えるのは、開いているプロジェクトのぶんだけである', () => {
    url.search = { only: true };
    url.match = { slug: '-w-alpha' };

    const text = (draw(twoProjects()).querySelector('#counts')?.textContent ?? '')
      .replace(/\s+/g, ' ')
      .trim();

    expect(text, '押して行ける先がこのウィンドウに無い待ちを、数に足さない').toBe(
      'active 1 / waiting 0 / ended 0',
    );
  });

  it('Overview では、いつもどおりタブ行を出す', () => {
    const container = draw(twoProjects());

    expect(
      container.querySelector('#tabs'),
      'タブが無いと、プロジェクトを移る手立てが無い',
    ).not.toBeNull();
    expect(container.querySelector('#here')).toBeNull();
  });
});

describe('変更通知が届いているか', () => {
  const draw = (connected: boolean, watching: boolean) => {
    const { container } = render(<ConnStatus connected={connected} watching={watching} />);
    const conn = container.querySelector('#conn');
    return {
      className: conn?.className ?? '',
      role: conn?.getAttribute('role') ?? null,
      text: conn?.textContent ?? '',
    };
  };

  it('繋がっていてウォッチャーも張れていれば、繋がっていると言う', () => {
    const { className, role, text } = draw(true, true);

    expect(className).toBe('on');
    expect(role, '勝手に変わる状態は読み上げられる必要がある').toBe('status');
    expect(text, '色だけでは読み上げに何も届かない').toContain('connected');
  });

  it('繋がってはいるが更新が届かないことを、繋がっていることと同じ顔で出さない', () => {
    const { className, text } = draw(true, false);

    expect(className, '繋がっているときと同じ色にすると、止まった画面が健全に見える').not.toBe(
      'on',
    );
    expect(text).toContain('updates will not arrive');
  });

  it('繋がっていないことは隠さない', () => {
    const { className, text } = draw(false, true);

    expect(className).not.toBe('on');
    expect(text).toContain('disconnected');
  });

  it('3 つの状態は、それぞれ別の文言で出る', () => {
    const said = [draw(true, true).text, draw(true, false).text, draw(false, true).text];

    expect(new Set(said).size).toBe(3);
  });
});
