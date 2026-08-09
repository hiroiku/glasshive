import { describe, expect, it } from 'vitest';
import { agentTokens, gitTokens, issueIndex } from '~/frameworks/tanstack/ui/derive/tokens.ts';

/* 文の中の語を、観測しているものと突き合わせる索き。

   **分からない語は触らない。** 手当たり次第に札にすると、ふつうの単語が押せるものに見えて、
   押しても何も起きない札が文中に散る。 */

/* 相手の形は、突き合わせる役自身から引く。ここは外の層の名前を見に行けないし、
   写して持てば、形が変わったときに片方だけ古いまま残る。 */
type ProjectJson = NonNullable<Parameters<typeof agentTokens>[0]>;
type SessionJson = ProjectJson['sessions'][number];
type SubagentJson = SessionJson['subagents'][number];

const subagent = (over: Partial<SubagentJson> = {}): SubagentJson => ({
  id: 'sub',
  label: 'sub',
  file: '/nest/sub.jsonl',
  state: 'ended',
  started: null,
  last_activity: '2026-08-09T12:00:00Z',
  tokens: null,
  tokens_state: 'observed',
  model: null,
  effort: null,
  git_branch: null,
  cwd: null,
  issue: null,
  current: null,
  intervals: [],
  intervals_complete: true,
  intervals_state: 'observed',
  ...over,
});

const session = (over: Partial<SessionJson> = {}): SessionJson => ({
  id: 'a1b2c3d4e5f6',
  file: '/nest/session.jsonl',
  title: null,
  state: 'ended',
  awaiting: null,
  started: null,
  last_activity: '2026-08-09T12:00:00Z',
  tokens: null,
  tokens_state: 'observed',
  model: null,
  effort: null,
  git_branch: null,
  cwd: null,
  actor: null,
  issues: [],
  current: null,
  intervals: [],
  intervals_complete: true,
  intervals_state: 'observed',
  size: 0,
  subagents: [],
  ...over,
});

const project = (sessions: SessionJson[]): ProjectJson => ({
  id: 'a',
  slug: 'a',
  path: '/nest/a',
  name: 'a',
  live_process: false,
  live_process_count: 0,
  tokens_24h: null,
  tokens_24h_state: 'observed',
  sessions,
});

describe('エージェントを特定できる語', () => {
  it('actor の名で引ける', () => {
    const index = agentTokens(project([session({ actor: 'mgr-x', file: '/nest/s.jsonl' })]));

    expect(index.get('mgr-x')?.file).toBe('/nest/s.jsonl');
  });

  /* bd の書き込み手は `mgr-{セッション id の先頭 8 桁}` で記録される。 */
  it('命名の決め事からも引ける', () => {
    const index = agentTokens(project([session({ id: 'a1b2c3d4e5f6' })]));

    expect(index.get('mgr-a1b2c3d4')).toBeDefined();
  });

  it('子の呼び名でも引ける', () => {
    const index = agentTokens(
      project([session({ subagents: [subagent({ label: 'reviewer', file: '/nest/r.jsonl' })] })]),
    );

    expect(index.get('reviewer')?.file).toBe('/nest/r.jsonl');
  });

  it('同じ名前が二度出たら、先に見付けたほうを残す', () => {
    const index = agentTokens(
      project([
        session({ actor: 'dup', file: '/nest/first.jsonl' }),
        session({ actor: 'dup', file: '/nest/second.jsonl' }),
      ]),
    );

    expect(index.get('dup')?.file).toBe('/nest/first.jsonl');
  });

  it('観測が無ければ空', () => {
    expect(agentTokens(undefined).size).toBe(0);
  });
});

describe('枝と作業場所の名前', () => {
  it('枝の名前を拾う', () => {
    const index = gitTokens(project([session({ git_branch: 'feature/x' })]));

    expect(index.get('feature/x')).toBe('branch');
  });

  it('作業場所の名前を決め事から拾う', () => {
    const index = gitTokens(project([session({ cwd: '/repo/.worktrees/mgr-a' })]));

    expect(index.get('mgr-a')).toBe('worktree');
  });

  it('子の枝も拾う', () => {
    const index = gitTokens(project([session({ subagents: [subagent({ git_branch: 'sub/y' })] })]));

    expect(index.get('sub/y')).toBe('branch');
  });
});

describe('課題の id の索き', () => {
  it('正式な id で引ける', () => {
    const index = issueIndex([{ id: 'kuden-os-4f2a', status: 'open' }]);

    expect(index.get('kuden-os-4f2a')).toEqual({ id: 'kuden-os-4f2a', closed: false });
  });

  it('閉じたものも索きに入れる', () => {
    const index = issueIndex([{ id: 'kuden-os-4f2a', status: 'closed' }]);

    expect(index.get('kuden-os-4f2a')?.closed).toBe(true);
  });

  /* 会話では `kuden-os-4f2a` が `4f2a` と略される。 */
  it('共通の頭を見付けて、略記からも引けるようにする', () => {
    const index = issueIndex([
      { id: 'kuden-os-4f2a', status: 'open' },
      { id: 'kuden-os-9b31', status: 'open' },
    ]);

    expect(index.get('4f2a')?.id).toBe('kuden-os-4f2a');
    expect(index.get('9b31')?.id).toBe('kuden-os-9b31');
  });

  it('短すぎる略記は引かない', () => {
    const index = issueIndex([
      { id: 'kuden-os-4f2', status: 'open' },
      { id: 'kuden-os-9b3', status: 'open' },
    ]);

    expect(index.get('4f2'), 'ふつうの語に当たってしまう').toBeUndefined();
  });

  it('共通の頭が無ければ、略記は作らない', () => {
    const index = issueIndex([
      { id: 'alpha-1234', status: 'open' },
      { id: 'beta-5678', status: 'open' },
    ]);

    expect(index.size).toBe(2);
  });

  it('id を持たない記録は飛ばす', () => {
    const index = issueIndex([{ id: null, status: 'open' }]);

    expect(index.size).toBe(0);
  });

  it('1 件だけなら略記は作らない', () => {
    const index = issueIndex([{ id: 'kuden-os-4f2a', status: 'open' }]);

    expect(index.size).toBe(1);
  });
});
