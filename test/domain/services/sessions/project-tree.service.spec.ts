import { describe, expect, it } from 'vitest';
import { AppError } from '~/app-kernel/error.ts';
import { observed, unobservable } from '~/app-kernel/observation.ts';
import {
  buildProjectTree,
  type DraftProject,
  type DraftSession,
  type DraftSubagent,
  deriveProjectPath,
} from '~/domain/services/sessions/project-tree.service.ts';
import { EMPTY_ACTIVITY } from '~/domain/value-objects/sessions/activity-interval.value-object.ts';

const T0 = Date.parse('2026-08-04T00:00:00Z');
const SEC = 1000;
const THRESHOLD = 60 * SEC;

class Denied extends AppError {
  readonly code = 'test.denied';
}

function subagent(at: number, overrides: Partial<DraftSubagent> = {}): DraftSubagent {
  return {
    id: 'agent-aimpl-foo-abcdef1234567890',
    label: 'aimpl-foo',
    agentType: null,
    parentId: null,
    depth: 1,
    file: '/p/agent-aimpl-foo-abcdef1234567890.jsonl',
    startedRaw: '2026-08-04T00:00:10Z',
    lastActivityMs: at,
    tokens: observed(0),
    model: null,
    effort: null,
    gitBranch: null,
    cwd: null,
    issue: null,
    current: null,
    activity: observed(EMPTY_ACTIVITY),
    recentTokens: observed(0),
    ...overrides,
  };
}

function session(at: number, overrides: Partial<DraftSession> = {}): DraftSession {
  return {
    id: 'sess',
    file: '/p/sess.jsonl',
    title: null,
    startedRaw: null,
    lastActivityMs: at,
    ownMtimeMs: at,
    awaitingCandidate: false,
    tokens: observed(0),
    model: null,
    effort: null,
    gitBranch: null,
    cwd: '/work/myproj',
    actor: null,
    issues: [],
    current: null,
    activity: observed(EMPTY_ACTIVITY),
    recentTokens: observed(0),
    sizeBytes: 0,
    subagents: [],
    ...overrides,
  };
}

function project(overrides: Partial<DraftProject> = {}): DraftProject {
  return {
    slug: '-work-myproj',
    canonicalPath: '/work/myproj',
    sessions: [session(T0)],
    ...overrides,
  };
}

function build(drafts: readonly DraftProject[], nowMs: number, processes: readonly string[] = []) {
  return buildProjectTree({
    drafts,
    processes: observed(processes.map((cwd, pid) => ({ pid, cwd }))),
    nowMs,
    activeThresholdMs: THRESHOLD,
  });
}

describe('三つの様子を導き出す', () => {
  it('閾値の内に書き込みがあれば稼働', () => {
    const tree = build([project()], T0 + 10 * SEC);
    expect(tree.projects[0]?.sessions[0]?.state).toBe('active');
  });

  it('閾値を過ぎて道具も生きていなければ終了', () => {
    const tree = build([project()], T0 + 600 * SEC);
    const first = tree.projects[0]?.sessions[0];
    expect(first?.state).toBe('ended');
    expect(first?.awaiting, '死んだセッションは何も待たない').toBe(null);
  });

  it('閾値を過ぎていても同じ巣に道具が生きていれば待機', () => {
    const tree = build([project()], T0 + 120 * SEC, ['/work/myproj']);
    expect(tree.projects[0]?.sessions[0]?.state).toBe('waiting');
  });

  it('待機の枠は生きている道具の数だけ、新しい順に配られる', () => {
    const tree = build(
      [
        project({
          sessions: [session(T0 - 60 * SEC, { id: 'old' }), session(T0, { id: 'new' })],
        }),
      ],
      T0 + 120 * SEC,
      ['/work/myproj'],
    );
    const sessions = tree.projects[0]?.sessions ?? [];
    expect(sessions.map((s) => s.id)).toEqual(['new', 'old']);
    expect(sessions[0]?.state, '道具 1 つぶんだけ、直近のセッションが待機').toBe('waiting');
    expect(sessions[1]?.state, '残りは終了。全部を待機にしない').toBe('ended');
  });
});

describe('何を待っているかを見分ける', () => {
  it('末尾が完結した応答で、子も止まっていれば人の入力待ち', () => {
    const tree = build(
      [project({ sessions: [session(T0, { awaitingCandidate: true })] })],
      T0 + 65 * SEC,
      ['/work/myproj'],
    );
    const first = tree.projects[0]?.sessions[0];
    expect(first?.state).toBe('waiting');
    expect(first?.awaiting).toBe('user');
  });

  it('自分が止まっていて子が動いていれば子待ち', () => {
    const tree = build(
      [
        project({
          sessions: [
            session(T0, {
              ownMtimeMs: T0 - 300 * SEC,
              awaitingCandidate: true,
              subagents: [subagent(T0)],
            }),
          ],
        }),
      ],
      T0 + 10 * SEC,
    );
    const first = tree.projects[0]?.sessions[0];
    expect(first?.state, '子の稼働はセッションの稼働').toBe('active');
    expect(first?.awaiting).toBe('agents');
  });

  it('自分も子も動いているうちは、まだ自分の番', () => {
    const tree = build(
      [
        project({
          sessions: [session(T0, { awaitingCandidate: true, subagents: [subagent(T0)] })],
        }),
      ],
      T0 + 10 * SEC,
    );
    expect(tree.projects[0]?.sessions[0]?.awaiting).toBe(null);
  });
});

describe('子の様子', () => {
  it('書き込みの新しさだけで決まる', () => {
    const tree = build(
      [
        project({
          sessions: [
            session(T0, {
              subagents: [subagent(T0, { id: 'a' }), subagent(T0 - 600 * SEC, { id: 'b' })],
            }),
          ],
        }),
      ],
      T0 + 10 * SEC,
    );
    const subs = tree.projects[0]?.sessions[0]?.subagents ?? [];
    expect(
      subs.map((s) => s.id),
      '新しい順に並ぶ',
    ).toEqual(['a', 'b']);
    expect(subs[0]?.state).toBe('active');
    expect(subs[1]?.state).toBe('ended');
  });

  it('子の書き込みはセッションの最終活動に含まれている前提で数える', () => {
    // lastActivityMs は読み取り側が「自分と子の最大」として渡す
    const tree = build(
      [
        project({
          sessions: [
            session(T0, {
              ownMtimeMs: T0 - 600 * SEC,
              subagents: [subagent(T0)],
            }),
          ],
        }),
      ],
      T0 + 10 * SEC,
    );
    expect(tree.projects[0]?.sessions[0]?.state).toBe('active');
  });
});

describe('巣を併せる', () => {
  it('同じ場所を指す別名は 1 つになり、道具は二重に数えない', () => {
    const tree = build(
      [
        project({ slug: '-work-myproj', sessions: [session(T0, { id: 'a' })] }),
        project({
          slug: '-Volumes-work-myproj',
          sessions: [session(T0 - SEC, { id: 'b', cwd: '/Volumes/work/myproj' })],
        }),
      ],
      T0 + 120 * SEC,
      ['/work/myproj'],
    );
    expect(tree.projects).toHaveLength(1);
    const only = tree.projects[0];
    expect(only?.id, '代表は辞書順で最も小さい名前').toBe('-Volumes-work-myproj');
    expect(only?.slugs).toEqual(['-Volumes-work-myproj', '-work-myproj']);
    expect(only?.liveProcessCount).toBe(1);
    expect(
      only?.sessions.map((s) => s.id),
      '併せた後も新しい順',
    ).toEqual(['a', 'b']);
  });

  it('併せてから配るので、待機の枠が別名に散らない', () => {
    const tree = build(
      [
        project({
          slug: 'a',
          sessions: [session(T0 - 600 * SEC, { id: 'x' })],
        }),
        project({
          slug: 'b',
          sessions: [session(T0 - 300 * SEC, { id: 'y' })],
        }),
      ],
      T0,
      ['/work/myproj'],
    );
    const sessions = tree.projects[0]?.sessions ?? [];
    expect(
      sessions.map((s) => s.state),
      '道具 1 つに対して待機も 1 つ',
    ).toEqual(['waiting', 'ended']);
  });

  it('呼び名は代表が書いていた場所の末尾から採る', () => {
    const only = build([project()], T0).projects[0];
    expect(only?.path).toBe('/work/myproj');
    expect(only?.name).toBe('myproj');
  });

  it('場所が分からない巣は名前をそのまま呼び名にする', () => {
    const tree = build(
      [
        project({
          canonicalPath: null,
          sessions: [session(T0, { cwd: null })],
        }),
      ],
      T0,
    );
    expect(tree.projects[0]?.name).toBe('-work-myproj');
  });
});

describe('巣の場所を導き出す', () => {
  it('最も新しいセッションが書いていた場所を採る', () => {
    expect(
      deriveProjectPath([
        session(T0 - 100 * SEC, { cwd: '/old/place' }),
        session(T0, { cwd: '/new/place' }),
      ]),
      '渡された順ではなく、新しい順に見る',
    ).toBe('/new/place');
  });

  it('場所を書いていないセッションは飛ばして、次を見る', () => {
    expect(
      deriveProjectPath([session(T0, { cwd: null }), session(T0 - SEC, { cwd: '/work/myproj' })]),
    ).toBe('/work/myproj');
    expect(deriveProjectPath([session(T0, { cwd: '' })])).toBe(null);
  });

  it('どのセッションも場所を書いていなければ無い', () => {
    expect(deriveProjectPath([session(T0, { cwd: null })])).toBe(null);
    expect(deriveProjectPath([])).toBe(null);
  });

  it('新しいセッションが場所を書いていなければ、古い方まで下がる', () => {
    // 並べてから探すので、渡す順を変えても答えは動かない
    const older = session(T0 - 100 * SEC, { cwd: '/work/myproj' });
    const newer = session(T0, { cwd: null });
    expect(deriveProjectPath([older, newer])).toBe('/work/myproj');
    expect(deriveProjectPath([newer, older])).toBe('/work/myproj');
  });
});

describe('道具の帰属', () => {
  it('最も深い巣ひとつだけに数える', () => {
    const tree = build(
      [
        project({
          slug: 'outer',
          canonicalPath: '/work',
          sessions: [session(T0, { cwd: '/work' })],
        }),
        project({ slug: 'inner', canonicalPath: '/work/myproj' }),
      ],
      T0 + 600 * SEC,
      ['/work/myproj/src'],
    );
    const byId = new Map(tree.projects.map((p) => [p.id, p.liveProcessCount]));
    expect(byId.get('inner')).toBe(1);
    expect(byId.get('outer'), '祖先へ波及させると、上位の巣が丸ごと生きて見える').toBe(0);
  });
});

describe('木そのもの', () => {
  it('セッションを持たない名前は巣として数えない', () => {
    expect(build([project({ sessions: [] })], T0).projects).toEqual([]);
  });

  it('巣は最終活動の新しい順に並ぶ', () => {
    const tree = build(
      [
        project({
          slug: 'old',
          canonicalPath: '/a',
          sessions: [session(T0 - 100 * SEC, { cwd: '/a' })],
        }),
        project({
          slug: 'new',
          canonicalPath: '/b',
          sessions: [session(T0, { cwd: '/b' })],
        }),
      ],
      T0,
    );
    expect(tree.projects.map((p) => p.id)).toEqual(['new', 'old']);
  });

  it('道具を数えられなくても木は組み、数えられなかったことを載せる', () => {
    const tree = buildProjectTree({
      drafts: [project()],
      processes: unobservable(new Denied('ps に断られた')),
      nowMs: T0 + 600 * SEC,
      activeThresholdMs: THRESHOLD,
    });
    expect(tree.projects, 'セッションそのものは見えている').toHaveLength(1);
    expect(tree.processes.kind).toBe('unobservable');
    expect(
      tree.projects[0]?.sessions[0]?.state,
      '待機を配れないので終了へ倒れる。倒れたことは processes から読める',
    ).toBe('ended');
  });

  it('数えられたときは総数を載せる', () => {
    const tree = build([project()], T0, ['/work/myproj', '/elsewhere']);
    expect(tree.processes).toEqual(observed(2));
    expect(tree.projects[0]?.liveProcessCount, 'どこにも含まれない道具は数えない').toBe(1);
  });
});

describe('直近の消費を巣ごとにまとめる', () => {
  it('セッションと子の両方を足す', () => {
    const tree = build(
      [
        project({
          sessions: [
            session(T0, {
              recentTokens: observed(10),
              subagents: [subagent(T0, { recentTokens: observed(5) })],
            }),
            session(T0 - SEC, { recentTokens: observed(100) }),
          ],
        }),
      ],
      T0,
    );

    expect(tree.projects[0]?.recentTokens, '子の正本は別に書かれるので足さないと欠ける').toEqual(
      observed(115),
    );
  });

  it('併せた巣では、併せた先の全部を足す', () => {
    const tree = build(
      [
        project({
          slug: '-work-myproj',
          sessions: [session(T0, { recentTokens: observed(3) })],
        }),
        project({
          slug: '-volumes-work-myproj',
          sessions: [session(T0 - SEC, { recentTokens: observed(4) })],
        }),
      ],
      T0,
    );

    expect(tree.projects, '同じ実体なので 1 つに併さる').toHaveLength(1);
    expect(tree.projects[0]?.recentTokens).toEqual(observed(7));
  });

  it('1 つでも読めない正本があれば、巣の数も読めなかったことにする', () => {
    const tree = build(
      [
        project({
          sessions: [
            session(T0, { recentTokens: observed(999) }),
            session(T0 - SEC, {
              recentTokens: unobservable(new Denied('開けない')),
            }),
          ],
        }),
      ],
      T0,
    );

    expect(
      tree.projects[0]?.recentTokens.kind,
      '読めた分だけを出すと、少ない数が静かだったという意味に読まれる',
    ).toBe('unobservable');
  });

  it('セッションと子の欄としては外へ出さない', () => {
    const tree = build([project({ sessions: [session(T0, { subagents: [subagent(T0)] })] })], T0);
    const first = tree.projects[0]?.sessions[0];

    expect(
      first && 'recentTokens' in first,
      '窓の幅は一覧の都合であって、セッションの性質ではない',
    ).toBe(false);
    expect(first?.subagents[0] && 'recentTokens' in first.subagents[0]).toBe(false);
  });
});
