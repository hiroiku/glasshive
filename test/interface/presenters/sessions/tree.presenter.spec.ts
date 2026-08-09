import { describe, expect, it } from 'vitest';
import { AppError } from '~/app-kernel/error.ts';
import { absent, type Observation, observed, unobservable } from '~/app-kernel/observation.ts';
import { iso, presentTree } from '~/interface/presenters/sessions/tree.presenter.ts';

/* 写す相手の形は、写す役自身から引く。ここは内側の名前を見に行けないし、
   写して持てば、出力が変わったときに片方だけ古いまま残る。 */
type ProjectTree = Parameters<typeof presentTree>[0];
type ObservedProject = ProjectTree['projects'][number];
type TranscriptSession = ObservedProject['sessions'][number];
type SubagentSession = TranscriptSession['subagents'][number];
type ActivityIntervalSet = Extract<TranscriptSession['activity'], { kind: 'observed' }>['value'];

class DeniedError extends AppError {
  readonly code = 'test.denied';
}

/** 何も動いていなかった帯。先頭まで読めたうえで、1 本も無い */
const EMPTY_ACTIVITY: ActivityIntervalSet = { intervals: [], complete: true };

/** 起点。ミリ秒を持たせてあるので、丸めたかどうかが字面で分かる */
const T = Date.parse('2026-08-04T00:00:00.123Z');
const MIN = 60_000;

function subagent(overrides: Partial<SubagentSession> = {}): SubagentSession {
  return {
    id: 'agent-a1b2',
    label: 'a1b2',
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
    actor: 'hiroiku',
    issues: ['gh-1', 'gh-2'],
    current: '書きもの',
    activity: observed(EMPTY_ACTIVITY),
    sizeBytes: 2048,
    subagents: [],
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

/** 木を組んで、1 つめの巣の 1 つめのセッションだけを取り出す */
function firstSession(overrides: Partial<TranscriptSession>) {
  const presented = presentTree(tree({ projects: [project({ sessions: [session(overrides)] })] }))
    .projects[0]?.sessions[0];
  if (presented === undefined) throw new Error('組み立てた木にセッションが無い');
  return presented;
}

describe('秒までの字面にする', () => {
  it('ミリ秒を落とす', () => {
    expect(
      iso(Date.parse('2026-08-04T00:00:00.123Z')),
      'ミリ秒まで出しても観る人には意味が無く、桁が揺れると目で比べにくい',
    ).toBe('2026-08-04T00:00:00Z');
  });

  it('ちょうど 0 ミリ秒でも同じ形にする', () => {
    expect(
      iso(Date.parse('2026-08-04T00:00:00.000Z')),
      '桁の有る無しで字面が変わると、並べたときに揃わない',
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

describe('起点の字面', () => {
  it('正本に書かれていた字をそのまま出す', () => {
    expect(
      firstSession({}).started,
      '正本の字面は数から起こしたものではないので、こちらで丸めると事実が変わる',
    ).toBe('2026-08-03T12:00:00.789Z');
  });

  it('子の起点も手を加えない', () => {
    expect(
      firstSession({ subagents: [subagent()] }).subagents[0]?.started,
      '子も同じ理由で、正本の字面をそのまま渡す',
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

  it('見えたときは数と observed', () => {
    const presented = withTokens(observed(4200));
    expect(presented.tokens, '見えた数はそのまま渡す').toBe(4200);
    expect(presented.tokens_state, '見えたことを言えるのはこの欄だけ').toBe('observed');
  });

  it('窓の外のときは null と absent', () => {
    const presented = withTokens(absent('out-of-window'));
    expect(presented.tokens, '読んでいない数を 0 と出すと「使っていない」と読まれる').toBe(null);
    expect(presented.tokens_state, '数が無い理由を言えないと、0 と読めなかったが同じに見える').toBe(
      'absent',
    );
  });

  it('読めなかったときは null と unobservable', () => {
    const presented = withTokens(unobservable(new DeniedError('読めない')));
    expect(presented.tokens, '読めなかったものに数は付けられない').toBe(null);
    expect(
      presented.tokens_state,
      '無かったのか読めなかったのかは、観る人にとって別の事実である',
    ).toBe('unobservable');
  });

  it('子の数も同じ写し方をする', () => {
    const child = firstSession({
      subagents: [subagent({ tokens: absent('empty') })],
    }).subagents[0];
    expect(child?.tokens, '子でも見えない数は null').toBe(null);
    expect(child?.tokens_state, '子でも理由は別の欄で言う').toBe('absent');
  });
});

describe('動いていた帯', () => {
  const withActivity = (activity: Observation<ActivityIntervalSet>) => firstSession({ activity });

  it('帯は字面の組の並びになる', () => {
    const presented = withActivity(
      observed({ intervals: [{ fromMs: T - MIN, toMs: T }], complete: true }),
    );
    expect(presented.intervals, '帯の端も数から起こした時刻なので、他と同じ丸め方で出す').toEqual([
      ['2026-08-03T23:59:00Z', '2026-08-04T00:00:00Z'],
    ]);
    expect(presented.intervals_state, '読めたのだから observed').toBe('observed');
  });

  it('先頭まで届いていなくても、読めたことは変わらない', () => {
    const presented = withActivity(
      observed({ intervals: [{ fromMs: T, toMs: T }], complete: false }),
    );
    expect(
      presented.intervals_state,
      '`complete` は窓がどこまで届いたかの話で、読めたかどうかの話ではない',
    ).toBe('observed');
    expect(presented.intervals_complete, '先頭まで届いていないことは、こちらの欄が言う').toBe(
      false,
    );
  });

  it('読み切って 1 本も無ければ observed のまま', () => {
    const presented = withActivity(observed({ intervals: [], complete: true }));
    expect(
      presented.intervals_state,
      '静かだった正本を「読めなかった」と言えば、開けもしなかったことになる',
    ).toBe('observed');
    expect(presented.intervals, '見えた結果が空なのだから、空を出す').toEqual([]);
  });

  it('窓の外で 1 本も無くても、読めたことは変わらない', () => {
    expect(
      withActivity(observed({ intervals: [], complete: false })).intervals_state,
      '末尾を読み切って何も無かったのであって、読みに行けなかったのではない',
    ).toBe('observed');
  });

  it('正本が消えていれば absent', () => {
    const presented = withActivity(absent('no-source'));
    expect(presented.intervals_state, '開く先が無いのだから、無いという事実である').toBe('absent');
    expect(presented.intervals, '見えていない帯は出さない').toEqual([]);
    expect(presented.intervals_complete, '開いてもいない正本に「先頭まで届いた」とは言えない').toBe(
      false,
    );
  });

  it('読みに行けなければ unobservable', () => {
    const presented = withActivity(unobservable(new DeniedError('開けない')));
    expect(
      presented.intervals_state,
      '開けなかった正本を「ずっと静かだった」と出せば、観る人は動いていないと読む',
    ).toBe('unobservable');
    expect(presented.intervals, '読めていないものに帯は付けられない').toEqual([]);
    expect(
      presented.intervals_complete,
      'true と言えば、開けなかった正本について「これで全部だ」と言うことになる',
    ).toBe(false);
  });

  it('子の帯も同じ写し方をする', () => {
    const child = firstSession({
      subagents: [subagent({ activity: unobservable(new DeniedError('開けない')) })],
    }).subagents[0];
    expect(child?.intervals_state, '子でも読めなかったことは読めなかったと言う').toBe(
      'unobservable',
    );
    expect(child?.intervals_complete, '子でも先頭まで届いたとは言わない').toBe(false);
  });
});

describe('生きている道具', () => {
  it('数えられたときは observed と理由なし', () => {
    expect(
      presentTree(tree({ processes: observed(3) })).processes,
      '見えたときに言うべき理由は無い',
    ).toEqual({ state: 'observed', reason: null });
  });

  it('数えるもとが無いときは absent と理由', () => {
    expect(
      presentTree(tree({ processes: absent('no-source') })).processes,
      '何が無かったのかまで言わないと、観る人は次に何をすべきか決められない',
    ).toEqual({ state: 'absent', reason: 'no-source' });
  });

  it('数えに行けなかったときは unobservable と誤りの名札', () => {
    expect(
      presentTree(tree({ processes: unobservable(new DeniedError('数えられない')) })).processes,
      '数えられなかったのに 0 と出せば、待っているセッションが全部終わったものに見える',
    ).toEqual({ state: 'unobservable', reason: 'test.denied' });
  });

  it('数えられなくても木は出る', () => {
    expect(
      presentTree(tree({ processes: unobservable(new DeniedError('だめ')) })).projects.length,
      '道具を数え損ねても、セッションそのものは見えている',
    ).toBe(1);
  });
});

describe('正本の置き場', () => {
  it('歩けたときは observed', () => {
    expect(presentTree(tree()).sources, '歩けたのなら、空の一覧は本当に空である').toEqual({
      state: 'observed',
      reason: null,
    });
  });

  it('置き場そのものが無いときは absent', () => {
    expect(
      presentTree(tree({ sources: absent('no-source'), projects: [] })).sources,
      'まだ 1 つも巣が無いのと、置き場が無いのは別の事実である',
    ).toEqual({ state: 'absent', reason: 'no-source' });
  });

  it('歩けなかったときは unobservable', () => {
    expect(
      presentTree(
        tree({
          sources: unobservable(new DeniedError('歩けない')),
          projects: [],
        }),
      ).sources,
      '歩けなかったのに空の一覧だけを返せば、巣が消えたように見える',
    ).toEqual({ state: 'unobservable', reason: 'test.denied' });
  });
});

describe('巣の欄', () => {
  it('代表の名前が id と slug の両方に出る', () => {
    const presented = presentTree(tree()).projects[0];
    expect(presented?.id, '併せた組を指す名は代表のもの 1 つ').toBe('-work-proj');
    expect(presented?.slug, '道に載せる名前も同じ字を使う').toBe('-work-proj');
  });

  it('道具が居なければ live_process は偽', () => {
    const presented = presentTree(tree()).projects[0];
    expect(presented?.live_process, '0 本なら動いていない').toBe(false);
    expect(presented?.live_process_count, '数もそのまま出す').toBe(0);
  });

  it('道具が居れば真と本数', () => {
    const presented = presentTree(tree({ projects: [project({ liveProcessCount: 2 })] }))
      .projects[0];
    expect(presented?.live_process, '1 本でも動いていれば真').toBe(true);
    expect(presented?.live_process_count, '真偽だけでは 1 本と数本が同じに見える').toBe(2);
  });

  it('場所が無いときは null', () => {
    expect(
      presentTree(tree({ projects: [project({ path: null })] })).projects[0]?.path,
      '書かれていないことは null で表す',
    ).toBe(null);
  });
});

describe('見える窓の広さ', () => {
  it('ミリ秒を秒に均す', () => {
    expect(
      presentTree(tree({ activeThresholdMs: 90_000 })).active_threshold_secs,
      '観る人に見せるのは秒。ミリ秒のままだと桁が読みにくい',
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
    expect(dumped.includes('slugs'), '併せ方は内側の事情で、観る人には要らない').toBe(false);
    expect(
      dumped.includes('-volumes-work-proj'),
      '欄の名前を消しても、代表でない名前の字が漏れていれば同じことである',
    ).toBe(false);
  });

  it('併せるための鍵に使った場所は出さない', () => {
    expect(
      dumped.includes('canonicalPath'),
      '鍵は突き合わせのための字であって、観る人が見る場所ではない',
    ).toBe(false);
    expect(
      dumped.includes('/Volumes/work/proj'),
      '解決済みの場所を出すと、正本に書かれていた場所と別の字が観る人に届く',
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

  it('木と巣に在る欄はこれで全部', () => {
    const presented = presentTree(tree());
    expect(Object.keys(presented), '木の直下に在るのはこの 5 つだけ').toEqual([
      'generated_at',
      'active_threshold_secs',
      'sources',
      'processes',
      'projects',
    ]);
    expect(
      Object.keys(presented.projects[0] ?? {}),
      '巣に余分な欄を足すと、受け取る側が内側の事情を知ってしまう',
    ).toEqual([
      'id',
      'slug',
      'path',
      'name',
      'live_process',
      'live_process_count',
      'tokens_24h',
      'tokens_24h_state',
      'sessions',
    ]);
  });

  it('直近の消費は数と様子の二つを添えて出す', () => {
    const presented = presentTree(tree({ projects: [project({ recentTokens: observed(1234) })] }))
      .projects[0];
    expect(presented?.tokens_24h, '一覧はこれを見るので、巣ごとに問い直さなくてよい').toBe(1234);
    expect(presented?.tokens_24h_state).toBe('observed');
  });

  it('読めなかった直近の消費は 0 にせず null にする', () => {
    const presented = presentTree(
      tree({
        projects: [project({ recentTokens: unobservable(new DeniedError('読めない')) })],
      }),
    ).projects[0];
    expect(presented?.tokens_24h, '0 を置くと「使っていない」と読まれる').toBe(null);
    expect(presented?.tokens_24h_state, '読めなかったことは様子の欄が言う').toBe('unobservable');
  });

  it('セッションに在る欄はこれで全部', () => {
    const presented = firstSession({ subagents: [subagent()] });
    expect(
      Object.keys(presented),
      '一番大きい塊をここで押さえないと、欄が黙って消えても検査は通ってしまう',
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
      'actor',
      'issues',
      'current',
      'intervals',
      'intervals_complete',
      'intervals_state',
      'size',
      'subagents',
    ]);
  });

  it('子に在る欄はこれで全部', () => {
    const presented = firstSession({ subagents: [subagent()] }).subagents[0];
    expect(Object.keys(presented ?? {}), '子も同じく、欄の抜けを字で押さえる').toEqual([
      'id',
      'label',
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
  it('巣は渡された順のまま', () => {
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
