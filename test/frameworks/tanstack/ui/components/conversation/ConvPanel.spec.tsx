import { render, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/* 会話のパネル。**「読めなかった」と「もっと前」を並べて出さない。**

   並ぶと、一度も読めていない `transcript` に押せるボタンが出る。押した先は前に開いていた
   別のファイルのバイトの位置なので、返ってくるものがあってもこの会話のものではない。

   末尾の追いかけが返らなくなったことは、末尾の側で言う。`#conversation` は末尾へ吸い付く
   スクロールの箱なので、**先頭に置いた板は、伸びなくなったことに気付く人の視界に入らない。**

   ヘッダーの `working on` に並ぶのは `.worktrees/<名前>` から拾った worktree の名前だけで、
   GitHub の課題の id には当たらない。チップにすると、押しても何も起きないものが並ぶ。 */

const { fetchConversation, listeners } = vi.hoisted(() => ({
  fetchConversation: vi.fn(),
  listeners: new Set<(path: string) => void>(),
}));

vi.mock('~/frameworks/tanstack/queries/sessions.query.ts', () => ({ fetchConversation }));

/* 変更通知は SSE の代わりにここから流す。確かめたいのは受けた側の描き方で、
   `EventSource` が繋がるかは別のところの話である。 */
vi.mock('~/frameworks/tanstack/ui/hooks/useChangeStream.ts', () => ({
  subscribeToFile: (listener: (path: string) => void) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
}));

/* イベント 1 件の描き方はここでは問わない。確かめたいのは、会話そのものを出せなかった
   ときに何が出るかである。 */
vi.mock('~/frameworks/tanstack/ui/components/conversation/EventView.tsx', () => ({
  EventView: () => <div className="ev" />,
}));

vi.mock('~/frameworks/tanstack/ui/nav/NavContext.tsx', () => ({
  useNav: () => ({ openIssue: vi.fn(), gotoIssues: vi.fn() }),
}));

const { ConvPanel } = await import(
  '~/frameworks/tanstack/ui/components/conversation/ConvPanel.tsx'
);

const FILE = '/nest/session.jsonl';
const OTHER = '/nest/other.jsonl';

/* プロジェクトの形は、受け取るパネルそのものから引く。写し取ると、形が変わっても気づけない */
type Project = NonNullable<Parameters<typeof ConvPanel>[0]['project']>;
type Session = Project['sessions'][number];

const AT = '2026-08-09T12:00:00Z';

const session = (issues: string[]): Session => ({
  id: 'a1b2c3d4',
  file: FILE,
  title: 'session',
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
  issues,
  current: null,
  intervals: [],
  intervals_complete: true,
  intervals_state: 'observed',
  size: 0,
  sources: { state: 'observed', reason: null },
  subagents: [],
});

const project = (issues: string[]): Project => ({
  id: 'hive',
  slug: 'hive',
  path: '/x',
  name: 'hive',
  live_process: true,
  live_process_count: 1,
  tokens_24h: null,
  tokens_24h_state: 'observed',
  read: true,
  sources: { state: 'observed', reason: null },
  sessions: [session(issues)],
});

const notify = (path: string) => {
  for (const listener of listeners) listener(path);
};

const event = { role: 'user' as const, ts: null, blocks: [] };

const page = (start: number, next: number) => ({
  ok: true,
  body: {
    state: 'observed',
    reason: null,
    start,
    next,
    eof: false,
    size: 4_000_000,
    events: [event],
  },
});

/** 観測できなかったページ。**無かったページではない** */
const unreadable = () => ({
  ok: true,
  body: {
    state: 'unobservable',
    reason: 'transcript.read_failed',
    start: 0,
    next: 0,
    eof: true,
    size: 0,
    events: [],
  },
});

beforeEach(() => {
  fetchConversation.mockReset();
  listeners.clear();
});

describe('会話のパネル', () => {
  it('読めなかったら、観測できなかったことを言う', async () => {
    fetchConversation.mockResolvedValue(unreadable());

    const { container } = render(<ConvPanel file={FILE} project={undefined} />);

    await waitFor(() => expect(container.querySelector('.not-observed')).not.toBeNull());
    expect(container.querySelectorAll('.ev'), '空の会話として出ている').toHaveLength(0);
  });

  it('読めなかった `transcript` に「もっと前」を出さない', async () => {
    fetchConversation
      // 前に開いていた、まだ前が在る会話
      .mockResolvedValueOnce(page(1_000_000, 1_000_100))
      .mockResolvedValueOnce(unreadable());

    const { container, rerender } = render(<ConvPanel file={FILE} project={undefined} />);
    await waitFor(() => expect(container.querySelector('#older')).not.toBeNull());

    rerender(<ConvPanel file={OTHER} project={undefined} />);

    await waitFor(() => expect(container.querySelector('.not-observed')).not.toBeNull());
    expect(
      container.querySelector('#older'),
      '前の `transcript` のバイトの位置で押せてしまう',
    ).toBeNull();
  });

  it('末尾の追いかけが観測できなかったら、末尾の側で言う', async () => {
    fetchConversation.mockResolvedValueOnce(page(0, 100)).mockResolvedValueOnce(unreadable());

    const { container } = render(<ConvPanel file={FILE} project={undefined} />);
    await waitFor(() => expect(container.querySelectorAll('.ev')).toHaveLength(1));

    notify(FILE);

    await waitFor(() => expect(container.querySelector('.conv-tail .not-observed')).not.toBeNull());
    expect(
      container.querySelector('#conversation')?.lastElementChild?.className,
      '会話の後ろに出ていない',
    ).toBe('conv-tail');
    expect(
      container.querySelector('#conversation > .not-observed'),
      '末尾を見ている人の視界に入らない先頭に出ている',
    ).toBeNull();
  });

  /* 勝手に変わる状態なので、目で見ていない人にも届かなければならない。 */
  it('観測できなかったことを、読み上げにも載せる', async () => {
    fetchConversation.mockResolvedValueOnce(page(0, 100)).mockResolvedValueOnce(unreadable());

    const { container } = render(<ConvPanel file={FILE} project={undefined} />);
    await waitFor(() => expect(container.querySelectorAll('.ev')).toHaveLength(1));

    notify(FILE);

    await waitFor(() =>
      expect(container.querySelector('[role="status"] .not-observed')).not.toBeNull(),
    );
  });
});

describe('ヘッダーの `working on`', () => {
  beforeEach(() => {
    fetchConversation.mockResolvedValue(page(0, 100));
  });

  it('worktree の名前はチップにしない', async () => {
    const { container } = render(<ConvPanel file={FILE} project={project(['issue-101'])} />);

    await waitFor(() => expect(container.querySelector('.wtname')).not.toBeNull());
    expect(container.querySelector('.wtname')?.textContent).toBe('issue-101');
    expect(
      container.querySelector('.ichip'),
      '押しても何も開かないものが、押せる顔で並んでいる',
    ).toBeNull();
    expect(container.querySelector('.agent-ctx button'), 'まだ押せる').toBeNull();
  });

  /* `#` を含む名前を作れる経路は無いが、来ても押しどころにはしない。 */
  it('課題の id の形をしていても、チップにしない', async () => {
    const { container } = render(<ConvPanel file={FILE} project={project(['#101'])} />);

    await waitFor(() => expect(container.querySelector('.wtname')).not.toBeNull());
    expect(container.querySelector('.wtname')?.textContent).toBe('#101');
    expect(container.querySelector('.ichip')).toBeNull();
  });
});

/* 待っていることを言わない画面は、「ここには何も無い」と読める。**まだ読んでいないことと、
   読んで無かったことを混ぜない** —— glasshive の決まりを、画面の側でも崩さない。 */
describe('読んでいる最中の会話', () => {
  /** 好きなときに答えを返せる求め */
  const held = () => {
    let settle: (value: unknown) => void = () => {};
    const answer = new Promise((resolve) => {
      settle = resolve;
    });
    return { answer, settle };
  };

  it('最初のページが返るまで、読んでいることを言う', async () => {
    const first = held();
    fetchConversation.mockReturnValueOnce(first.answer);

    const { container } = render(<ConvPanel file={FILE} project={project([])} />);

    await waitFor(() =>
      expect(
        container.querySelector('[role="progressbar"]')?.getAttribute('aria-label'),
        '空の会話にすると、これから届く会話が「何も話されていないセッション」になる',
      ).toBe('Reading the conversation'),
    );
    expect(container.querySelector('#older'), '読み取り範囲をまだ持たない').toBeNull();

    first.settle(page(1_000_000, 1_000_100));
    await waitFor(() => expect(container.querySelectorAll('.ev')).toHaveLength(1));
    expect(container.querySelector('[role="progressbar"]')).toBeNull();
  });

  /* 遡っているあいだ、押したボタンをそのまま残すと、押しても何も変わらないボタンが居座る。
     **届いていないのか、もう前が無いのかが読めない。**

     入れ替えた先が数えているのは `transcript` のバイトであって、画面に並ぶイベントではない。
     何を数えているかを言わないと、その割合が会話の進み具合として読まれる。 */
  it('遡っているあいだは、ボタンを読めたバイトと入れ替える', async () => {
    const older = held();
    fetchConversation
      .mockResolvedValueOnce(page(1_000_000, 1_000_100))
      .mockReturnValueOnce(older.answer);

    const { container } = render(<ConvPanel file={FILE} project={project([])} />);
    await waitFor(() => expect(container.querySelector('#older')).not.toBeNull());

    (container.querySelector('#older') as HTMLButtonElement).click();

    await waitFor(() =>
      expect(container.querySelector('[role="progressbar"]')?.getAttribute('aria-label')).toBe(
        'Reading older messages',
      ),
    );
    expect(container.querySelector('#older'), '押しても何も変わらないボタンを残さない').toBeNull();
    expect(
      container.querySelector('.rp-scan')?.textContent,
      '裸の割合は、会話のどこまでが出たかとして読まれる',
    ).toBe('0.0 of 3.8 MiB read from this transcript');
    expect(
      (container.querySelector('.rp-fill') as HTMLElement | null)?.style.width,
      '塗る幅は、読めたバイトと `transcript` の大きさからしか決まらない',
    ).toBe('0.0025%');

    older.settle(page(500_000, 600_000));
    await waitFor(() => expect(container.querySelector('#older')).not.toBeNull());
  });
});
