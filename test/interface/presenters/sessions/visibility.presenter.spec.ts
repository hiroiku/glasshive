import { describe, expect, it } from 'vitest';
import type {
  ProjectJson,
  SessionJson,
  SubagentJson,
} from '~/interface/presenters/sessions/tree.presenter.ts';
import {
  MAX_VISIBLE_SUBAGENTS,
  projectDotState,
  visibleSessions,
  visibleSubagents,
} from '~/interface/presenters/sessions/visibility.presenter.ts';

/* 既定で何を見せるか。**観測ではなく、見せ方の予算である。**

   ここが狂うと、動いているものが画面から消える。消えたことは観る人には
   「何も起きていない」としか見えないので、どの層よりも取り違えが痛い。 */

const NOW = Date.parse('2026-08-09T12:00:00.000Z');
const ago = (ms: number) => new Date(NOW - ms).toISOString();

const subagent = (over: Partial<SubagentJson> = {}): SubagentJson => ({
  id: 'sub',
  label: 'sub',
  agent_type: null,
  parent: null,
  depth: 1,
  file: '/nest/sub.jsonl',
  state: 'ended',
  started: null,
  last_activity: ago(0),
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
  id: 'session',
  file: '/nest/session.jsonl',
  title: null,
  state: 'ended',
  awaiting: null,
  started: null,
  last_activity: ago(0),
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

describe('見せるセッションを選ぶ', () => {
  it('動いているものと待っているものは、いつでも出す', () => {
    const rows = visibleSessions(
      project([
        session({ file: 'a', state: 'active', last_activity: ago(30 * 86_400_000) }),
        session({ file: 'b', state: 'waiting', last_activity: ago(30 * 86_400_000) }),
      ]),
      false,
      NOW,
    );

    expect(rows.map((row) => row.file)).toEqual(['a', 'b']);
  });

  it('終わっていても、直近に動いていたものは出す', () => {
    const rows = visibleSessions(
      project([
        session({ file: 'recent', last_activity: ago(3_600_000) }),
        session({ file: 'old', last_activity: ago(2 * 86_400_000) }),
      ]),
      false,
      NOW,
    );

    expect(rows.map((row) => row.file)).toEqual(['recent']);
  });

  it('全部見たいと言われたら、終わったものも出す', () => {
    const rows = visibleSessions(
      project([session({ file: 'old', last_activity: ago(2 * 86_400_000) })]),
      true,
      NOW,
    );

    expect(rows.map((row) => row.file)).toEqual(['old']);
  });

  it('読めない時刻は「最近ではない」に倒す', () => {
    const rows = visibleSessions(
      project([session({ file: 'broken', last_activity: 'いつか' })]),
      false,
      NOW,
    );

    expect(rows).toEqual([]);
  });
});

describe('見せる子を選ぶ', () => {
  it('動いている子は、上限を越えても全部出す', () => {
    const subagents = Array.from({ length: 12 }, (_, index) =>
      subagent({ file: `a${index}`, state: 'active' }),
    );

    const rows = visibleSubagents(session({ subagents }), false, NOW);

    expect(rows).toHaveLength(12);
  });

  it('空きがあれば、直近に動いていた子で埋める', () => {
    const subagents = [
      subagent({ file: 'live', state: 'active' }),
      ...Array.from({ length: 12 }, (_, index) =>
        subagent({ file: `done${index}`, last_activity: ago(3_600_000) }),
      ),
    ];

    const rows = visibleSubagents(session({ subagents }), false, NOW);

    expect(rows).toHaveLength(MAX_VISIBLE_SUBAGENTS);
    expect(rows.some((row) => row.file === 'live')).toBe(true);
  });

  /* 選び方と並べ方を混ぜると、動いている子が先頭へ寄って、時間の並びとして読めなくなる。 */
  it('並びは元のままにする', () => {
    const subagents = [
      subagent({ file: 'first', last_activity: ago(3_600_000) }),
      subagent({ file: 'second', state: 'active' }),
      subagent({ file: 'third', last_activity: ago(3_600_000) }),
    ];

    const rows = visibleSubagents(session({ subagents }), false, NOW);

    expect(rows.map((row) => row.file)).toEqual(['first', 'second', 'third']);
  });

  it('古い子は落とす', () => {
    const subagents = [subagent({ file: 'old', last_activity: ago(3 * 86_400_000) })];

    expect(visibleSubagents(session({ subagents }), false, NOW)).toEqual([]);
    expect(visibleSubagents(session({ subagents }), true, NOW)).toHaveLength(1);
  });
});

describe('巣ひとつを 1 点で言い表す', () => {
  it('返事待ちが 1 つでもあれば、それを最優先で見せる', () => {
    const dot = projectDotState(
      project([session({ state: 'active' }), session({ state: 'waiting', awaiting: 'user' })]),
    );

    expect(dot).toBe('input');
  });

  it('動いているものがあれば、動いていると言う', () => {
    expect(projectDotState(project([session({ state: 'active' })]))).toBe('active');
  });

  it('道具が生きていれば、待っていると言う', () => {
    expect(projectDotState({ ...project([session()]), live_process: true })).toBe('waiting');
  });

  it('どれでもなければ、終わっていると言う', () => {
    expect(projectDotState(project([session()]))).toBe('ended');
  });
});
