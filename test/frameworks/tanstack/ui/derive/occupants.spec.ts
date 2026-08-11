import { describe, expect, it } from 'vitest';
import { occupantIndex, occupantsOf } from '~/frameworks/tanstack/ui/derive/occupants.ts';

/* `worktree` に居るエージェント。

   `git` の側は「どのブランチがどこに出ているか」しか言わない。誰がそこで働いているかは
   観測の側にしかない。**終わったエージェントは入れない** — 答えるのは「いま誰か居るか」である。 */

/* プロジェクトの形は、突き合わせる実装そのものから引く */
type ProjectJson = NonNullable<Parameters<typeof occupantIndex>[0]>;
type SessionJson = ProjectJson['sessions'][number];
type SubagentJson = SessionJson['subagents'][number];

const subagent = (over: Partial<SubagentJson> = {}): SubagentJson => ({
  id: 'sub',
  label: 'sub',
  agent_type: null,
  name: null,
  tool_use: null,
  parent: null,
  depth: 1,
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
  read: true,
  sessions,
});

describe('`worktree` に居るエージェント', () => {
  it('その `worktree` そのものに居るエージェントを引く', () => {
    const index = occupantIndex(project([session({ cwd: '/repo/.worktrees/x' })]));

    expect(occupantsOf(index, '/repo/.worktrees/x')).toHaveLength(1);
  });

  /* エージェントはプロジェクトの中の一段深いところで動くことがある。 */
  it('その下で働いているエージェントも引く', () => {
    const index = occupantIndex(project([session({ cwd: '/repo/.worktrees/x/src' })]));

    expect(occupantsOf(index, '/repo/.worktrees/x')).toHaveLength(1);
  });

  /* 名前の先頭が同じだけの別のパスを拾うと、居ないはずの `worktree` にエージェントが立つ。 */
  it('名前の先頭が同じだけの別のパスは拾わない', () => {
    const index = occupantIndex(project([session({ cwd: '/repo/.worktrees/xyz' })]));

    expect(occupantsOf(index, '/repo/.worktrees/x')).toEqual([]);
  });

  it('終わったエージェントは入れない', () => {
    const index = occupantIndex(project([session({ state: 'ended', cwd: '/repo/.worktrees/x' })]));

    expect(occupantsOf(index, '/repo/.worktrees/x')).toEqual([]);
  });

  it('子も同じように数える', () => {
    const index = occupantIndex(
      project([session({ cwd: null, subagents: [subagent({ cwd: '/repo/.worktrees/x' })] })]),
    );

    expect(occupantsOf(index, '/repo/.worktrees/x')).toHaveLength(1);
  });

  it('動いているエージェントを先に出す', () => {
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

  it('パスが無ければ空', () => {
    expect(occupantsOf(occupantIndex(undefined), null)).toEqual([]);
  });
});
