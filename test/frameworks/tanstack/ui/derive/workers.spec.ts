import { describe, expect, it } from 'vitest';
import {
  liveCount,
  type MatchedWorker,
  viaLabel,
  workerIndex,
  workersOn,
} from '~/frameworks/tanstack/ui/derive/workers.ts';

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
  read: true,
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

/* 課題の id と PR のブランチを突き合わせる。

   **課題の id が会話に一度も出ないことがある。** それでも、その課題を閉じる PR の
   ブランチでエージェントが動いていれば、動かしているのは同じ作業である。 */

/** 突き合わせる側の形も、実装そのものから引く */
type Issue = Parameters<typeof workersOn>[1];

const issue = (id: string, branches: readonly (string | null)[] = []): Issue => ({
  id,
  github:
    branches.length === 0
      ? null
      : {
          url: null,
          labels: [],
          assignees: [],
          author: null,
          milestone: null,
          issue_type_color: null,
          sub_issues: null,
          pull_requests: branches.map((head, at) => ({
            number: at + 1,
            state: 'OPEN',
            is_draft: false,
            review_decision: null,
            head_ref_name: head,
          })),
          comments: 0,
          reactions: 0,
        },
});

describe('PR のブランチで、エージェントと課題を結ぶ', () => {
  it('git のブランチからも引ける', () => {
    const index = workerIndex(project([session({ git_branch: 'feat/x-1' })]));

    expect(index.get('feat/x-1')).toHaveLength(1);
  });

  it('子のブランチからも引ける', () => {
    const index = workerIndex(
      project([session({ subagents: [subagent({ git_branch: 'feat/x-1' })] })]),
    );

    expect(index.get('feat/x-1')?.[0]).toMatchObject({ kind: 'subagent' });
  });

  it('ブランチを持たないセッションは、鍵を増やさない', () => {
    const index = workerIndex(project([session({ git_branch: null })]));

    expect(index.get(''), '空の鍵で全員が引けてしまう').toBeUndefined();
  });

  it('課題の id が会話に出ていなくても、PR のブランチで見つかる', () => {
    const index = workerIndex(
      project([session({ file: '/nest/s.jsonl', git_branch: 'feat/x-1', issues: [] })]),
    );

    const found = workersOn(index, issue('#7', ['feat/x-1']));

    expect(found).toHaveLength(1);
    expect(found[0]?.file).toBe('/nest/s.jsonl');
    expect(found[0]?.via, 'どの鍵で見つけたかを落とさない').toBe('branch');
    expect(found[0]?.pull, 'どの PR 越しかが読めないと、突き合わせを人が検証できない').toBe(1);
  });

  it('id で見つけた相手を、ブランチで二度並べない', () => {
    const index = workerIndex(
      project([session({ file: '/nest/s.jsonl', git_branch: 'feat/x-1', issues: ['#7'] })]),
    );

    const found = workersOn(index, issue('#7', ['feat/x-1']));

    expect(found).toHaveLength(1);
    expect(found[0]?.via, '会話の中で名指ししているほうが強い証拠である').toBe('issue');
  });

  it('id で引けたものを先に置く', () => {
    const index = workerIndex(
      project([
        session({ file: '/nest/named.jsonl', issues: ['#7'] }),
        session({ file: '/nest/branch.jsonl', git_branch: 'feat/x-1' }),
      ]),
    );

    expect(workersOn(index, issue('#7', ['feat/x-1'])).map((worker) => worker.file)).toEqual([
      '/nest/named.jsonl',
      '/nest/branch.jsonl',
    ]);
  });

  it('ブランチ名を持たない PR では、何も増えない', () => {
    const index = workerIndex(project([session({ git_branch: 'feat/x-1' })]));

    expect(workersOn(index, issue('#7', [null]))).toHaveLength(0);
  });

  it('GitHub の欄が無い課題は、id だけで引く', () => {
    const index = workerIndex(project([session({ issues: ['#7'] })]));

    expect(workersOn(index, issue('#7'))).toHaveLength(1);
  });
});

describe('突き合わせの訳', () => {
  it('ブランチ越しなら、どの PR かを言う', () => {
    const index = workerIndex(project([session({ git_branch: 'feat/x-1' })]));
    const found = workersOn(index, issue('#7', ['feat/x-1']));

    expect(viaLabel(found[0] as MatchedWorker)).toBe('on the branch of PR #1');
  });

  it('会話で名指しされているなら、何も添えない', () => {
    const index = workerIndex(project([session({ issues: ['#7'] })]));
    const found = workersOn(index, issue('#7'));

    expect(viaLabel(found[0] as MatchedWorker), '要らない説明を並べない').toBe(null);
  });
});
