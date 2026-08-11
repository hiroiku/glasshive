import { describe, expect, it } from 'vitest';
import { AppError } from '~/app-kernel/error.ts';
import { observed, unobservable } from '~/app-kernel/observation.ts';
import { buildProjectIndex } from '~/domain/services/sessions/project-index.service.ts';
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
    name: null,
    toolUseId: null,
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

describe('三つの状態を導き出す', () => {
  it('閾値の内に書き込みがあれば稼働', () => {
    const tree = build([project()], T0 + 10 * SEC);
    expect(tree.projects[0]?.sessions[0]?.state).toBe('active');
  });

  it('閾値を過ぎてプロセスも生きていなければ終了', () => {
    const tree = build([project()], T0 + 600 * SEC);
    const first = tree.projects[0]?.sessions[0];
    expect(first?.state).toBe('ended');
    expect(first?.awaiting, '死んだセッションは何も待たない').toBe(null);
  });

  it('閾値を過ぎていても同じプロジェクトにプロセスが生きていれば待機', () => {
    const tree = build([project()], T0 + 120 * SEC, ['/work/myproj']);
    expect(tree.projects[0]?.sessions[0]?.state).toBe('waiting');
  });

  it('待機の枠は生きているプロセスの数だけ、新しい順に配られる', () => {
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
    expect(sessions[0]?.state, 'プロセス 1 つぶんだけ、直近のセッションが待機').toBe('waiting');
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

describe('子の状態', () => {
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

describe('プロジェクトを併せる', () => {
  it('同じパスを指す別名は 1 つになり、プロセスは二重に数えない', () => {
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
      'プロセス 1 つに対して待機も 1 つ',
    ).toEqual(['waiting', 'ended']);
  });

  it('名前は代表が書いていた作業ディレクトリの末尾から採る', () => {
    const only = build([project()], T0).projects[0];
    expect(only?.path).toBe('/work/myproj');
    expect(only?.name).toBe('myproj');
  });

  it('パスが分からないプロジェクトは、`slug` をそのまま名前にする', () => {
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

describe('プロジェクトのパスを導き出す', () => {
  it('最も新しいセッションが書いていた作業ディレクトリを採る', () => {
    expect(
      deriveProjectPath([
        session(T0 - 100 * SEC, { cwd: '/old/place' }),
        session(T0, { cwd: '/new/place' }),
      ]),
      '渡された順ではなく、新しい順に見る',
    ).toBe('/new/place');
  });

  it('作業ディレクトリを書いていないセッションは飛ばして、次を見る', () => {
    expect(
      deriveProjectPath([session(T0, { cwd: null }), session(T0 - SEC, { cwd: '/work/myproj' })]),
    ).toBe('/work/myproj');
    expect(deriveProjectPath([session(T0, { cwd: '' })])).toBe(null);
  });

  it('どのセッションも作業ディレクトリを書いていなければ無い', () => {
    expect(deriveProjectPath([session(T0, { cwd: null })])).toBe(null);
    expect(deriveProjectPath([])).toBe(null);
  });

  it('新しいセッションが作業ディレクトリを書いていなければ、古い方まで下がる', () => {
    // 並べてから探すので、渡す順を変えても結果は動かない
    const older = session(T0 - 100 * SEC, { cwd: '/work/myproj' });
    const newer = session(T0, { cwd: null });
    expect(deriveProjectPath([older, newer])).toBe('/work/myproj');
    expect(deriveProjectPath([newer, older])).toBe('/work/myproj');
  });
});

describe('プロセスの帰属', () => {
  it('最も深いプロジェクトひとつだけに数える', () => {
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
    expect(byId.get('outer'), '祖先へ波及させると、上位のプロジェクトが丸ごと生きて見える').toBe(0);
  });
});

describe('木そのもの', () => {
  it('セッションを持たない名前はプロジェクトとして数えない', () => {
    expect(build([project({ sessions: [] })], T0).projects).toEqual([]);
  });

  it('プロジェクトは最終活動の新しい順に並ぶ', () => {
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

  it('プロセスを数えられなくても木は組み、数えられなかったことを載せる', () => {
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
    expect(tree.projects[0]?.liveProcessCount, 'どこにも含まれないプロセスは数えない').toBe(1);
  });
});

describe('直近の消費をプロジェクトごとにまとめる', () => {
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

    expect(
      tree.projects[0]?.recentTokens,
      'サブエージェントの `transcript` は別に書かれるので、足さないと欠ける',
    ).toEqual(observed(115));
  });

  it('併せたプロジェクトでは、併せた先の全部を足す', () => {
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

  it('1 つでも読めない `transcript` があれば、プロジェクトの数も観測できなかったことにする', () => {
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
      '集計期間の長さは一覧の都合であって、セッションの性質ではない',
    ).toBe(false);
    expect(first?.subagents[0] && 'recentTokens' in first.subagents[0]).toBe(false);
  });
});

/* 走査できなかったところは、数として 0 を出さない。

   歩けなかったディレクトリの中に何が居たかは分からない。そこを 0 で埋めると、見に行けなかった
   ことが「消費が無かった」「セッションが 1 つも無かった」と言い切られる。 */
describe('走査できたかを木まで運ぶ', () => {
  it('ディレクトリを走査できなかったプロジェクトは、走査できなかったことを載せる', () => {
    const closed = project({
      slug: '-work-closed',
      canonicalPath: null,
      sessions: [],
      walked: unobservable(new Denied('開けない')),
    });

    const tree = build([closed], T0);

    expect(
      tree.projects.map((p) => p.id),
      '落とすとプロジェクトが黙って消える',
    ).toEqual(['-work-closed']);
    expect(tree.projects[0]?.walked.kind).toBe('unobservable');
  });

  it('ディレクトリを走査できなかったプロジェクトの消費を、0 と言い切らない', () => {
    const closed = project({
      slug: '-work-closed',
      canonicalPath: null,
      sessions: [],
      walked: unobservable(new Denied('開けない')),
    });

    const tree = build([closed], T0);

    expect(
      tree.projects[0]?.recentTokens.kind,
      '見に行けなかったことを「消費が無かった」と書くのは、観測できなかったことを無かったことにするのと同じである',
    ).toBe('unobservable');
  });

  it('子のディレクトリを走査できなかったセッションは、プロジェクトの消費まで観測できなかったことにする', () => {
    const tree = build(
      [
        project({
          sessions: [
            session(T0, {
              recentTokens: observed(999),
              subagentsWalked: unobservable(new Denied('開けない')),
            }),
          ],
        }),
      ],
      T0,
    );

    expect(
      tree.projects[0]?.recentTokens.kind,
      '数え落とした子のぶんが、少ない数に化けて「静かだった」と読まれる',
    ).toBe('unobservable');
    expect(tree.projects[0]?.sessions[0]?.subagentsWalked.kind).toBe('unobservable');
  });

  it('子を走査できたセッションでは、消費の合計に何も足さない', () => {
    const tree = build(
      [
        project({
          sessions: [session(T0, { recentTokens: observed(10), subagentsWalked: observed(7) })],
        }),
      ],
      T0,
    );

    expect(tree.projects[0]?.recentTokens, '走査で見えた本数は消費ではない').toEqual(observed(10));
  });

  it('走査できたと言われていないセッションは、見えた子のぶんだけ走査できたものとする', () => {
    const tree = build([project({ sessions: [session(T0, { subagents: [subagent(T0)] })] })], T0);

    expect(tree.projects[0]?.sessions[0]?.subagentsWalked).toEqual(observed(1));
  });
});

/* 索引が言う行と、木が言う行。

   一覧はまず索引で行を敷き、読み終えたプロジェクトを `id` で置き換えていく。**片方にしか
   無い `id` が 1 つでもあると、その行は置き換わらないまま「読んでいない」で残る。** 並びが
   違えば、読み終えるたびに行が跳ねる。どちらも `indexProjects` を通ることで防いでいるので、
   同じ入力から同じ行が同じ順で出ることをここで固定する。 */
describe('索引と木は同じ行を名指す', () => {
  const drafts = [
    project({ slug: '-work-beta', canonicalPath: '/work/beta', sessions: [session(T0 - SEC)] }),
    project({ slug: '-work-alpha', canonicalPath: '/work/alpha', sessions: [session(T0)] }),
    /* 同じ実体を指す別の slug。併合の代表がどちらでも、索引と木で同じでなければならない */
    project({
      slug: '-work-alpha-2',
      canonicalPath: '/work/alpha',
      sessions: [session(T0 - 2 * SEC)],
    }),
    // セッションを持たない slug。どちらも行として数えない
    project({ slug: '-work-empty', canonicalPath: '/work/empty', sessions: [] }),
  ];
  const processes = observed([{ pid: 1, cwd: '/work/alpha' }]);

  const index = buildProjectIndex({
    groups: drafts,
    processes,
    sources: observed(drafts.length),
    nowMs: T0,
    activeThresholdMs: THRESHOLD,
    transcriptsOf: () => 1,
  });
  const tree = buildProjectTree({ drafts, processes, nowMs: T0, activeThresholdMs: THRESHOLD });

  it('`id` が同じ順で並ぶ', () => {
    expect(index.stubs.map((stub) => stub.id)).toEqual(tree.projects.map((found) => found.id));
  });

  it('名前とパスも食い違わない', () => {
    expect(index.stubs.map((stub) => [stub.name, stub.path, stub.canonicalPath])).toEqual(
      tree.projects.map((found) => [found.name, found.path, found.canonicalPath]),
    );
  });

  it('帰属したプロセスの数も食い違わない', () => {
    expect(index.stubs.map((stub) => stub.liveProcessCount)).toEqual(
      tree.projects.map((found) => found.liveProcessCount),
    );
  });

  it('束ねた slug も食い違わない', () => {
    expect(index.stubs.map((stub) => stub.slugs)).toEqual(
      tree.projects.map((found) => found.slugs),
    );
  });
});
