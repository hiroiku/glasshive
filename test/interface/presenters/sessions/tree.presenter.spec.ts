import { describe, expect, it } from 'vitest';
import { AppError } from '~/app-kernel/error.ts';
import { absent, type Observation, observed, unobservable } from '~/app-kernel/observation.ts';
import {
  iso,
  presentIndexTree,
  presentTree,
} from '~/interface/presenters/sessions/tree.presenter.ts';

/* 変換元の形は、プレゼンター自身から引く。ここは内側の名前を `import` できないし、
   書き写して持てば、出力が変わったときに片方だけ古いまま残る。 */
type ProjectTree = Parameters<typeof presentTree>[0];
type ObservedProject = ProjectTree['projects'][number];
type TranscriptSession = ObservedProject['sessions'][number];
type SubagentSession = TranscriptSession['subagents'][number];
type ActivityIntervalSet = Extract<TranscriptSession['activity'], { kind: 'observed' }>['value'];

class DeniedError extends AppError {
  readonly code = 'test.denied';
}

/** 何も動いていなかった稼働区間。先頭まで読めたうえで、1 本も無い */
const EMPTY_ACTIVITY: ActivityIntervalSet = { intervals: [], complete: true };

/** 起点。ミリ秒を持たせてあるので、丸めたかどうかが表記で分かる */
const T = Date.parse('2026-08-04T00:00:00.123Z');
const MIN = 60_000;

function subagent(overrides: Partial<SubagentSession> = {}): SubagentSession {
  return {
    id: 'agent-a1b2',
    label: 'a1b2',
    agentType: null,
    name: null,
    toolUseId: null,
    parentId: null,
    depth: 1,
    file: '/root/proj/sess/subagents/agent-a1b2.jsonl',
    state: 'ended',
    startedRaw: '2026-08-03T23:59:59.456Z',
    lastActivityMs: T,
    tokens: observed(120),
    model: 'sonnet',
    effort: null,
    gitBranch: 'main',
    cwd: '/work/proj',
    issue: 'gh-1',
    current: '調べもの',
    activity: observed(EMPTY_ACTIVITY),
    ...overrides,
  };
}

function session(overrides: Partial<TranscriptSession> = {}): TranscriptSession {
  return {
    id: 'sess',
    file: '/root/proj/sess.jsonl',
    state: 'active',
    awaiting: 'user',
    title: '題',
    startedRaw: '2026-08-03T12:00:00.789Z',
    lastActivityMs: T,
    ownMtimeMs: T - MIN,
    tokens: observed(4200),
    model: 'opus',
    effort: 'high',
    gitBranch: 'main',
    cwd: '/work/proj',
    issues: ['gh-1', 'gh-2'],
    current: '書きもの',
    activity: observed(EMPTY_ACTIVITY),
    sizeBytes: 2048,
    subagents: [],
    subagentsWalked: absent('no-source'),
    ...overrides,
  };
}

function project(overrides: Partial<ObservedProject> = {}): ObservedProject {
  return {
    id: '-work-proj',
    slugs: ['-work-proj', '-volumes-work-proj'],
    path: '/work/proj',
    canonicalPath: '/Volumes/work/proj',
    name: 'proj',
    liveProcessCount: 0,
    sessions: [session()],
    latestActivityMs: T,
    recentTokens: observed(0),
    walked: observed(1),
    ...overrides,
  };
}

function tree(overrides: Partial<ProjectTree> = {}): ProjectTree {
  return {
    generatedAtMs: T,
    activeThresholdMs: 90_000,
    sources: observed(1),
    processes: observed(0),
    projects: [project()],
    ...overrides,
  };
}

/** 木を組んで、1 つめのプロジェクトの 1 つめのセッションだけを取り出す */
function firstSession(overrides: Partial<TranscriptSession>) {
  const presented = presentTree(tree({ projects: [project({ sessions: [session(overrides)] })] }))
    .projects[0]?.sessions[0];
  if (presented === undefined) throw new Error('組み立てた木にセッションが無い');
  return presented;
}

describe('秒までの表記にする', () => {
  it('ミリ秒を落とす', () => {
    expect(
      iso(Date.parse('2026-08-04T00:00:00.123Z')),
      'ミリ秒まで出してもユーザーには意味が無く、桁が揺れると目で比べにくい',
    ).toBe('2026-08-04T00:00:00Z');
  });

  it('ちょうど 0 ミリ秒でも同じ形にする', () => {
    expect(
      iso(Date.parse('2026-08-04T00:00:00.000Z')),
      '桁の有る無しで表記が変わると、並べたときに揃わない',
    ).toBe('2026-08-04T00:00:00Z');
  });

  it('木を起こした時刻も秒まで', () => {
    expect(
      presentTree(tree()).generated_at,
      '数から起こした時刻はすべて同じ丸め方でなければ、比べられない',
    ).toBe('2026-08-04T00:00:00Z');
  });

  it('最後に動いた時刻も秒まで', () => {
    expect(
      firstSession({}).last_activity,
      '最後に動いた時刻は数から起こしたものなので、丸める側に入る',
    ).toBe('2026-08-04T00:00:00Z');
  });
});

describe('起点の表記', () => {
  it('`transcript` に書かれていた文字列をそのまま出す', () => {
    expect(
      firstSession({}).started,
      '`transcript` の表記は数から起こしたものではないので、こちらで丸めると事実が変わる',
    ).toBe('2026-08-03T12:00:00.789Z');
  });

  it('子の起点も手を加えない', () => {
    expect(
      firstSession({ subagents: [subagent()] }).subagents[0]?.started,
      '子も同じ理由で、`transcript` の表記をそのまま渡す',
    ).toBe('2026-08-03T23:59:59.456Z');
  });

  it('起点が無ければ null', () => {
    expect(firstSession({ startedRaw: null }).started, '書かれていないことは null で表す').toBe(
      null,
    );
  });
});

describe('数の見え方', () => {
  const withTokens = (tokens: Observation<number>) => firstSession({ tokens });

  it('観測できたときは数と observed', () => {
    const presented = withTokens(observed(4200));
    expect(presented.tokens, '観測できた数はそのまま渡す').toBe(4200);
    expect(presented.tokens_state, '観測できたことを言えるのはこの欄だけ').toBe('observed');
  });

  it('読み取り範囲の外のときは null と absent', () => {
    const presented = withTokens(absent('out-of-window'));
    expect(presented.tokens, '読んでいない数を 0 と出すと「使っていない」と読まれる').toBe(null);
    expect(
      presented.tokens_state,
      '数が無い理由を言えないと、0 と観測できなかったが同じに見える',
    ).toBe('absent');
  });

  it('観測できなかったときは null と unobservable', () => {
    const presented = withTokens(unobservable(new DeniedError('読めない')));
    expect(presented.tokens, '観測できなかったものに数は付けられない').toBe(null);
    expect(
      presented.tokens_state,
      '無かったのか観測できなかったのかは、ユーザーにとって別の事実である',
    ).toBe('unobservable');
  });

  it('子の数も同じように変換する', () => {
    const child = firstSession({
      subagents: [subagent({ tokens: absent('empty') })],
    }).subagents[0];
    expect(child?.tokens, '子でも数が無ければ null').toBe(null);
    expect(child?.tokens_state, '子でも理由は別の欄で言う').toBe('absent');
  });
});

describe('稼働区間', () => {
  const withActivity = (activity: Observation<ActivityIntervalSet>) => firstSession({ activity });

  it('稼働区間は時刻の表記の組の並びになる', () => {
    const presented = withActivity(
      observed({ intervals: [{ fromMs: T - MIN, toMs: T }], complete: true }),
    );
    expect(
      presented.intervals,
      '稼働区間の端も数から起こした時刻なので、他と同じ丸め方で出す',
    ).toEqual([['2026-08-03T23:59:00Z', '2026-08-04T00:00:00Z']]);
    expect(presented.intervals_state, '読めたのだから observed').toBe('observed');
  });

  it('先頭まで届いていなくても、読めたことは変わらない', () => {
    const presented = withActivity(
      observed({ intervals: [{ fromMs: T, toMs: T }], complete: false }),
    );
    expect(
      presented.intervals_state,
      '`complete` は読み取り範囲がどこまで届いたかの話で、読めたかどうかの話ではない',
    ).toBe('observed');
    expect(presented.intervals_complete, '先頭まで届いていないことは、こちらの欄が言う').toBe(
      false,
    );
  });

  it('読み切って 1 本も無ければ observed のまま', () => {
    const presented = withActivity(observed({ intervals: [], complete: true }));
    expect(
      presented.intervals_state,
      '静かだった `transcript` を「観測できなかった」と言えば、開けもしなかったことになる',
    ).toBe('observed');
    expect(presented.intervals, '観測できた結果が空なのだから、空を出す').toEqual([]);
  });

  it('読み取り範囲の外で 1 本も無くても、読めたことは変わらない', () => {
    expect(
      withActivity(observed({ intervals: [], complete: false })).intervals_state,
      '末尾を読み切って何も無かったのであって、観測できなかったのではない',
    ).toBe('observed');
  });

  it('`transcript` が消えていれば absent', () => {
    const presented = withActivity(absent('no-source'));
    expect(presented.intervals_state, '開く先が無いのだから、無いという事実である').toBe('absent');
    expect(presented.intervals, '観測できていない稼働区間は出さない').toEqual([]);
    expect(
      presented.intervals_complete,
      '開いてもいない `transcript` に「先頭まで届いた」とは言えない',
    ).toBe(false);
  });

  it('観測しに行けなければ unobservable', () => {
    const presented = withActivity(unobservable(new DeniedError('開けない')));
    expect(
      presented.intervals_state,
      '開けなかった `transcript` を「ずっと静かだった」と出せば、ユーザーは動いていないと読む',
    ).toBe('unobservable');
    expect(presented.intervals, '読めていないものに稼働区間は付けられない').toEqual([]);
    expect(
      presented.intervals_complete,
      'true と言えば、開けなかった `transcript` について「これで全部だ」と言うことになる',
    ).toBe(false);
  });

  it('子の稼働区間も同じように変換する', () => {
    const child = firstSession({
      subagents: [subagent({ activity: unobservable(new DeniedError('開けない')) })],
    }).subagents[0];
    expect(child?.intervals_state, '子でも観測できなかったことは観測できなかったと言う').toBe(
      'unobservable',
    );
    expect(child?.intervals_complete, '子でも先頭まで届いたとは言わない').toBe(false);
  });
});

describe('生きているプロセス', () => {
  it('数えられたときは observed と理由なし', () => {
    expect(
      presentTree(tree({ processes: observed(3) })).processes,
      '見えたときに言うべき理由は無い',
    ).toEqual({ state: 'observed', reason: null });
  });

  it('数えるもとが無いときは absent と理由', () => {
    expect(
      presentTree(tree({ processes: absent('no-source') })).processes,
      '何が無かったのかまで言わないと、ユーザーは次に何をすべきか決められない',
    ).toEqual({ state: 'absent', reason: 'no-source' });
  });

  it('数えに行けなかったときは unobservable とエラーコード', () => {
    expect(
      presentTree(tree({ processes: unobservable(new DeniedError('数えられない')) })).processes,
      '数えられなかったのに 0 と出せば、待っているセッションが全部終わったものに見える',
    ).toEqual({ state: 'unobservable', reason: 'test.denied' });
  });

  it('数えられなくても木は出る', () => {
    expect(
      presentTree(tree({ processes: unobservable(new DeniedError('だめ')) })).projects.length,
      'プロセスを数え損ねても、セッションそのものは見えている',
    ).toBe(1);
  });
});

describe('`~/.claude/projects` を走査できたか', () => {
  it('走査できたときは observed', () => {
    expect(presentTree(tree()).sources, '走査できたのなら、空の一覧は本当に空である').toEqual({
      state: 'observed',
      reason: null,
    });
  });

  it('ディレクトリそのものが無いときは absent', () => {
    expect(
      presentTree(tree({ sources: absent('no-source'), projects: [] })).sources,
      'まだ 1 つもプロジェクトが無いのと、`~/.claude/projects` が無いのは別の事実である',
    ).toEqual({ state: 'absent', reason: 'no-source' });
  });

  it('走査できなかったときは unobservable', () => {
    expect(
      presentTree(
        tree({
          sources: unobservable(new DeniedError('走査できない')),
          projects: [],
        }),
      ).sources,
      '走査できなかったのに空の一覧だけを返せば、プロジェクトが消えたように見える',
    ).toEqual({ state: 'unobservable', reason: 'test.denied' });
  });
});

describe('プロジェクトの欄', () => {
  it('代表の名前が id と slug の両方に出る', () => {
    const presented = presentTree(tree()).projects[0];
    expect(presented?.id, '併せた組を指す名は代表のもの 1 つ').toBe('-work-proj');
    expect(presented?.slug, 'URL に載せる名前も同じ文字列を使う').toBe('-work-proj');
  });

  it('プロセスが居なければ live_process は偽', () => {
    const presented = presentTree(tree()).projects[0];
    expect(presented?.live_process, '0 本なら動いていない').toBe(false);
    expect(presented?.live_process_count, '数もそのまま出す').toBe(0);
  });

  it('プロセスが居れば真と本数', () => {
    const presented = presentTree(tree({ projects: [project({ liveProcessCount: 2 })] }))
      .projects[0];
    expect(presented?.live_process, '1 本でも動いていれば真').toBe(true);
    expect(presented?.live_process_count, '真偽だけでは 1 本と数本が同じに見える').toBe(2);
  });

  it('パスが無いときは null', () => {
    expect(
      presentTree(tree({ projects: [project({ path: null })] })).projects[0]?.path,
      '書かれていないことは null で表す',
    ).toBe(null);
  });
});

describe('プロジェクトのディレクトリを走査できたか', () => {
  it('走査できたときは observed', () => {
    expect(
      presentTree(tree()).projects[0]?.sources,
      '走査できたのなら、空のセッションは本当に空である',
    ).toEqual({ state: 'observed', reason: null });
  });

  it('走査できなかったときは unobservable とエラーコード', () => {
    const presented = presentTree(
      tree({
        projects: [
          project({
            sessions: [],
            walked: unobservable(new DeniedError('開けない')),
            recentTokens: unobservable(new DeniedError('開けない')),
          }),
        ],
      }),
    ).projects[0];

    expect(
      presented?.sources,
      '空のセッションだけを返せば、セッションを 1 つも持たないプロジェクトと同じ形になる',
    ).toEqual({ state: 'unobservable', reason: 'test.denied' });
    expect(presented?.read, '中身は読み終えている。読めなかったのは走査の側である').toBe(true);
    expect(presented?.tokens_24h, '走査できなかったところに 0 を置かない').toBe(null);
  });
});

/* まだ 1 行も読んでいない一覧。走査そのものは索引を作った時点で済んでいるので、
   読む前でも「走れなかったディレクトリ」は走れなかったと言える。 */
describe('読む前の一覧', () => {
  type ProjectIndex = Parameters<typeof presentIndexTree>[0];
  type ProjectStub = ProjectIndex['stubs'][number];

  const stub = (overrides: Partial<ProjectStub> = {}): ProjectStub => ({
    id: '-work-proj',
    slugs: ['-work-proj'],
    path: '/work/proj',
    canonicalPath: '/Volumes/work/proj',
    name: 'proj',
    liveProcessCount: 0,
    latestActivityMs: T,
    transcriptCount: 2,
    walked: observed(2),
    ...overrides,
  });

  const index = (stubs: readonly ProjectStub[]): ProjectIndex => ({
    generatedAtMs: T,
    activeThresholdMs: 90_000,
    sources: observed(stubs.length),
    processes: observed(0),
    stubs,
  });

  it('読む前の行でも、走査できたことは言える', () => {
    const presented = presentIndexTree(index([stub()])).projects[0];
    expect(presented?.read, '中身はまだ読んでいない').toBe(false);
    expect(presented?.sources, '走査は索引を作った時点で済んでいる').toEqual({
      state: 'observed',
      reason: null,
    });
  });

  it('走査できなかった行は、読む前から走査できなかったと言える', () => {
    const presented = presentIndexTree(
      index([stub({ transcriptCount: 0, walked: unobservable(new DeniedError('開けない')) })]),
    ).projects[0];

    expect(
      presented?.sources,
      '`read` が偽なだけでは、まだ読んでいないのか読む相手が数えられなかったのかが分からない',
    ).toEqual({ state: 'unobservable', reason: 'test.denied' });
  });
});

describe('子のディレクトリを走査できたか', () => {
  it('子を呼んでいないセッションでは absent', () => {
    expect(
      firstSession({}).sources,
      '`subagents` のディレクトリが無いのは、読めなかったのではなく無かったのである',
    ).toEqual({ state: 'absent', reason: 'no-source' });
  });

  it('走査できたときは observed', () => {
    expect(firstSession({ subagentsWalked: observed(2) }).sources).toEqual({
      state: 'observed',
      reason: null,
    });
  });

  it('走査できなかったときは unobservable とエラーコード', () => {
    const presented = firstSession({
      subagentsWalked: unobservable(new DeniedError('開けない')),
    });

    expect(
      presented.sources,
      '空の一覧だけでは、子を呼ばなかったセッションと子を数えられなかったセッションが同じに見える',
    ).toEqual({ state: 'unobservable', reason: 'test.denied' });
    expect(presented.subagents, '数えられなくてもセッションそのものは出す').toEqual([]);
  });
});

describe('「動いている」と見なす期間の長さ', () => {
  it('ミリ秒を秒に変換する', () => {
    expect(
      presentTree(tree({ activeThresholdMs: 90_000 })).active_threshold_secs,
      'ユーザーに見せるのは秒。ミリ秒のままだと桁が読みにくい',
    ).toBe(90);
  });

  it('端数は四捨五入する', () => {
    expect(
      presentTree(tree({ activeThresholdMs: 1500 })).active_threshold_secs,
      '整数で渡さないと、受け取る側がまた丸め方を決めることになる',
    ).toBe(2);
  });
});

describe('内側だけの欄', () => {
  const dumped = JSON.stringify(
    presentTree(
      tree({
        projects: [project({ sessions: [session({ subagents: [subagent()] })] })],
      }),
    ),
  );

  it('併せた元の名前は出さない', () => {
    expect(dumped.includes('slugs'), '併せ方は内側の事情で、ユーザーには要らない').toBe(false);
    expect(
      dumped.includes('-volumes-work-proj'),
      '欄の名前を消しても、代表でない名前の文字列が漏れていれば同じことである',
    ).toBe(false);
  });

  it('併せるためのキーに使ったパスは出さない', () => {
    expect(
      dumped.includes('canonicalPath'),
      'キーは突き合わせのための文字列であって、ユーザーが見るパスではない',
    ).toBe(false);
    expect(
      dumped.includes('/Volumes/work/proj'),
      '解決済みのパスを出すと、`transcript` に書かれていたパスと別の文字列がユーザーに届く',
    ).toBe(false);
  });

  it('自分だけの書き込み時刻は出さない', () => {
    expect(
      dumped.includes('ownMtimeMs'),
      '子待ちの判定に使うためだけの数で、判定はもう済んでいる',
    ).toBe(false);
  });

  it('camelCase の欄が紛れ込まない', () => {
    expect(
      /"[a-z]+[A-Z]/.test(dumped),
      '外へ出す名前は snake_case で揃える。混ざると受け取る側が両方を覚えることになる',
    ).toBe(false);
  });

  it('木とプロジェクトに在る欄はこれで全部', () => {
    const presented = presentTree(tree());
    expect(Object.keys(presented), '木の直下に在るのはこの 7 つだけ').toEqual([
      'generated_at',
      'active_threshold_secs',
      'sources',
      'processes',
      'complete',
      'progress',
      'projects',
    ]);
    expect(
      Object.keys(presented.projects[0] ?? {}),
      'プロジェクトに余分な欄を足すと、受け取る側が内側の事情を知ってしまう',
    ).toEqual([
      'id',
      'slug',
      'path',
      'name',
      'live_process',
      'live_process_count',
      'tokens_24h',
      'tokens_24h_state',
      'read',
      'sources',
      'sessions',
    ]);
  });

  it('直近の消費は数と状態の二つを添えて出す', () => {
    const presented = presentTree(tree({ projects: [project({ recentTokens: observed(1234) })] }))
      .projects[0];
    expect(
      presented?.tokens_24h,
      '一覧はこれを見るので、プロジェクトごとに問い直さなくてよい',
    ).toBe(1234);
    expect(presented?.tokens_24h_state).toBe('observed');
  });

  it('読めなかった直近の消費は 0 にせず null にする', () => {
    const presented = presentTree(
      tree({
        projects: [project({ recentTokens: unobservable(new DeniedError('読めない')) })],
      }),
    ).projects[0];
    expect(presented?.tokens_24h, '0 を置くと「使っていない」と読まれる').toBe(null);
    expect(presented?.tokens_24h_state, '観測できなかったことは状態の欄が言う').toBe(
      'unobservable',
    );
  });

  it('セッションに在る欄はこれで全部', () => {
    const presented = firstSession({ subagents: [subagent()] });
    expect(
      Object.keys(presented),
      '一番大きい塊をここで押さえないと、欄が黙って消えてもテストは通ってしまう',
    ).toEqual([
      'id',
      'file',
      'title',
      'state',
      'awaiting',
      'started',
      'last_activity',
      'tokens',
      'tokens_state',
      'model',
      'effort',
      'git_branch',
      'cwd',
      'issues',
      'current',
      'intervals',
      'intervals_complete',
      'intervals_state',
      'size',
      'sources',
      'subagents',
    ]);
  });

  it('子に在る欄はこれで全部', () => {
    const presented = firstSession({ subagents: [subagent()] }).subagents[0];
    expect(Object.keys(presented ?? {}), '子も同じく、欄の抜けを名前の一覧で押さえる').toEqual([
      'id',
      'label',
      'agent_type',
      'name',
      'tool_use',
      'parent',
      'depth',
      'file',
      'state',
      'started',
      'last_activity',
      'tokens',
      'tokens_state',
      'model',
      'effort',
      'git_branch',
      'cwd',
      'issue',
      'current',
      'intervals',
      'intervals_complete',
      'intervals_state',
    ]);
  });
});

describe('並びは触らない', () => {
  /* 並べ替えは導出の仕事である。ここでもう一度並べると、同じ判断が二か所に散り、
     片方だけ直したときに木の並びと画面の並びが食い違う。 */
  it('プロジェクトは渡された順のまま', () => {
    const presented = presentTree(
      tree({
        projects: [
          project({ id: 'a', latestActivityMs: T - MIN }),
          project({ id: 'b', latestActivityMs: T }),
        ],
      }),
    );
    expect(
      presented.projects.map((each) => each.id),
      '新しい順に直すと、導出が決めた並びを黙って上書きすることになる',
    ).toEqual(['a', 'b']);
  });

  it('セッションと子も渡された順のまま', () => {
    const presented = presentTree(
      tree({
        projects: [
          project({
            sessions: [
              session({
                id: 'old',
                lastActivityMs: T - MIN,
                subagents: [
                  subagent({ id: 'agent-old', lastActivityMs: T - MIN }),
                  subagent({ id: 'agent-new', lastActivityMs: T }),
                ],
              }),
              session({ id: 'new', lastActivityMs: T }),
            ],
          }),
        ],
      }),
    ).projects[0];
    expect(
      presented?.sessions.map((each) => each.id),
      'セッションの並びも導出が決めている',
    ).toEqual(['old', 'new']);
    expect(
      presented?.sessions[0]?.subagents.map((each) => each.id),
      '子の並びも同じ',
    ).toEqual(['agent-old', 'agent-new']);
  });
});
