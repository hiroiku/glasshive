import { describe, expect, it } from 'vitest';
import { occupantIndex, occupantsOf } from '~/frameworks/tanstack/ui/derive/occupants.ts';

/* 作業場所に居るエージェント。

   記録の側は「どの枝がどこに出ているか」しか言わない。誰がそこで働いているかは
   観測の側にしかない。**終わった手は入れない** — 答えるのは「いま誰か居るか」である。 */

/* 巣の形は、突き合わせる役自身から引く */
type ProjectJson = NonNullable<Parameters<typeof occupantIndex>[0]>;
type SessionJson = ProjectJson['sessions'][number];
type SubagentJson = SessionJson['subagents'][number];

const subagent = (over: Partial<SubagentJson> = {}): SubagentJson => ({
  id: 'sub',
  label: 'sub',
  file: '/nest/sub.jsonl',
  state: 'active',
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
  state: 'active',
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
  path: '/repo',
  name: 'a',
  live_process: false,
  live_process_count: 0,
  tokens_24h: null,
  tokens_24h_state: 'observed',
  sessions,
});

describe('作業場所に居る手', () => {
  it('その場所そのものに居る手を引く', () => {
    const index = occupantIndex(project([session({ cwd: '/repo/.worktrees/x' })]));

    expect(occupantsOf(index, '/repo/.worktrees/x')).toHaveLength(1);
  });

  /* エージェントは巣の中の一段深いところで動くことがある。 */
  it('その下で働いている手も引く', () => {
    const index = occupantIndex(project([session({ cwd: '/repo/.worktrees/x/src' })]));

    expect(occupantsOf(index, '/repo/.worktrees/x')).toHaveLength(1);
  });

  /* 名前の先頭が同じだけの別の場所を拾うと、居ないはずの線に人が立つ。 */
  it('名前の先頭が同じだけの別の場所は拾わない', () => {
    const index = occupantIndex(project([session({ cwd: '/repo/.worktrees/xyz' })]));

    expect(occupantsOf(index, '/repo/.worktrees/x')).toEqual([]);
  });

  it('終わった手は入れない', () => {
    const index = occupantIndex(project([session({ state: 'ended', cwd: '/repo/.worktrees/x' })]));

    expect(occupantsOf(index, '/repo/.worktrees/x')).toEqual([]);
  });

  it('子も同じように数える', () => {
    const index = occupantIndex(
      project([session({ cwd: null, subagents: [subagent({ cwd: '/repo/.worktrees/x' })] })]),
    );

    expect(occupantsOf(index, '/repo/.worktrees/x')).toHaveLength(1);
  });

  it('動いている手を先に出す', () => {
    const index = occupantIndex(
      project([
        session({ file: '/nest/waiting.jsonl', state: 'waiting', cwd: '/repo/.worktrees/x' }),
        session({ file: '/nest/active.jsonl', state: 'active', cwd: '/repo/.worktrees/x' }),
      ]),
    );

    expect(occupantsOf(index, '/repo/.worktrees/x').map((one) => one.file)).toEqual([
      '/nest/active.jsonl',
      '/nest/waiting.jsonl',
    ]);
  });

  it('場所が無ければ空', () => {
    expect(occupantsOf(occupantIndex(undefined), null)).toEqual([]);
  });
});
