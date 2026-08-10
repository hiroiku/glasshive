import { describe, expect, it } from 'vitest';
import { liveCount, workerIndex } from '~/frameworks/tanstack/ui/derive/workers.ts';

/* 課題の id から「いま誰が触っているか」を引くインデックス。

   **bd には書かれていない。** 書かれているのは assignee という人の申告だけである。
   ここが繋がって初めて、申告と実態の食い違いが画面に出る。 */

/* プロジェクトの形は、インデックスを組む実装そのものから引く。写して持てば、形が変わったときに片方だけ古いまま残る */
type ProjectJson = NonNullable<Parameters<typeof workerIndex>[0]>;
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

describe('課題を触っているエージェントを引く', () => {
  it('会話の中で触れられた課題から引ける', () => {
    const index = workerIndex(
      project([session({ issues: ['kuden-os-4f2a'], file: '/nest/s.jsonl' })]),
    );

    expect(index.get('kuden-os-4f2a')?.[0]?.file).toBe('/nest/s.jsonl');
  });

  /* worktree を課題の id で切る使い方が広く行われている。その名前は cwd に出る。 */
  it('`worktree` の名前からも引ける', () => {
    const index = workerIndex(project([session({ cwd: '/repo/.worktrees/kuden-os-4f2a' })]));

    expect(index.get('kuden-os-4f2a')).toHaveLength(1);
  });

  it('子が名指した課題からも引ける', () => {
    const index = workerIndex(
      project([session({ subagents: [subagent({ issue: 'x-1', file: '/nest/sub.jsonl' })] })]),
    );

    expect(index.get('x-1')?.[0]).toMatchObject({ kind: 'subagent', file: '/nest/sub.jsonl' });
  });

  /* 触れ方が 2 通りあっても、触っているエージェントは 1 つである。 */
  it('同じ `transcript` を二度並べない', () => {
    const index = workerIndex(project([session({ issues: ['x-1'], cwd: '/repo/.worktrees/x-1' })]));

    expect(index.get('x-1')).toHaveLength(1);
  });

  it('別の `transcript` なら、並べる', () => {
    const index = workerIndex(
      project([
        session({ file: '/nest/one.jsonl', issues: ['x-1'] }),
        session({ file: '/nest/two.jsonl', issues: ['x-1'] }),
      ]),
    );

    expect(index.get('x-1')).toHaveLength(2);
  });

  it('観測が無ければ空', () => {
    expect(workerIndex(undefined).size).toBe(0);
  });
});

describe('生きているエージェントの数', () => {
  it('終わったエージェントは数えない', () => {
    const index = workerIndex(
      project([
        session({ file: '/nest/live.jsonl', state: 'active', issues: ['x-1'] }),
        session({ file: '/nest/done.jsonl', state: 'ended', issues: ['x-1'] }),
      ]),
    );

    expect(liveCount(index.get('x-1') ?? [])).toBe(1);
  });
});
