import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ConnStatus, countsOf } from '~/frameworks/tanstack/routes/__root.tsx';

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
