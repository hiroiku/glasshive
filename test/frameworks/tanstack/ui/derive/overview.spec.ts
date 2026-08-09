import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SORT,
  DEFAULT_SPAN,
  deriveRows,
  dotStateOf,
  filterRows,
  type OverviewRow,
  sortRows,
  tokensCeiling,
  totalsOf,
  withinSpan,
} from '~/frameworks/tanstack/ui/derive/overview.ts';

const T = Date.parse('2026-08-04T00:00:00Z');
const iso = (ms: number): string => new Date(ms).toISOString();

/* 材料の形は、行を起こす役自身から引く。ここは外の道の形を宣言した層を見に行けない。 */
type ProjectJson = Parameters<typeof deriveRows>[0][number];
type SessionJson = ProjectJson['sessions'][number];
type SubagentJson = SessionJson['subagents'][number];

function subagent(overrides: Partial<SubagentJson> = {}): SubagentJson {
  return {
    id: 'agent-x',
    label: 'x',
    file: '/p/agent-x.jsonl',
    state: 'ended',
    started: null,
    last_activity: iso(T),
    tokens: 0,
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
    ...overrides,
  };
}

function session(overrides: Partial<SessionJson> = {}): SessionJson {
  return {
    id: 'sess',
    file: '/p/sess.jsonl',
    title: null,
    state: 'ended',
    awaiting: null,
    started: null,
    last_activity: iso(T),
    tokens: 0,
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
    ...overrides,
  };
}

function project(overrides: Partial<ProjectJson> = {}): ProjectJson {
  return {
    id: '-work-proj',
    slug: '-work-proj',
    path: '/work/proj',
    name: 'proj',
    live_process: false,
    live_process_count: 0,
    tokens_24h: 0,
    tokens_24h_state: 'observed',
    sessions: [session()],
    ...overrides,
  };
}

function row(overrides: Partial<OverviewRow> = {}): OverviewRow {
  return {
    id: 'p',
    name: 'p',
    path: '/work/p',
    parent: null,
    active: 0,
    waiting: 0,
    input: 0,
    tokens24h: 0,
    tokens24hState: 'observed',
    lastActivityMs: T,
    liveProcess: false,
    ...overrides,
  };
}

describe('一覧の行を起こす', () => {
  it('様子ごとにセッションを数える', () => {
    const rows = deriveRows([
      project({
        sessions: [
          session({ state: 'active' }),
          session({ state: 'waiting', awaiting: 'user' }),
          session({ state: 'ended' }),
        ],
      }),
    ]);

    expect(rows[0]?.active).toBe(1);
    expect(rows[0]?.waiting).toBe(1);
    expect(rows[0]?.input, '人の入力を待っている数は別に数える').toBe(1);
  });

  it('動いている子も稼働の数に足す', () => {
    const rows = deriveRows([
      project({
        sessions: [
          session({
            state: 'waiting',
            subagents: [subagent({ state: 'active' }), subagent({ state: 'ended' })],
          }),
        ],
      }),
    ]);

    expect(
      rows[0]?.active,
      '子は行に現れないので、ここで数えないと何も動いていないように見える',
    ).toBe(1);
  });

  it('最終活動は巣の中で最も新しいものを採る', () => {
    const rows = deriveRows([
      project({
        sessions: [session({ last_activity: iso(T - 5000) }), session({ last_activity: iso(T) })],
      }),
    ]);

    expect(rows[0]?.lastActivityMs).toBe(T);
  });

  it('直近の消費は木に入っている値をそのまま持つ', () => {
    const rows = deriveRows([project({ tokens_24h: 4321, tokens_24h_state: 'observed' })]);

    expect(rows[0]?.tokens24h, '巣ごとに問い直さない').toBe(4321);
  });

  it('読めなかった消費は null のまま運び、様子も添える', () => {
    const rows = deriveRows([project({ tokens_24h: null, tokens_24h_state: 'unobservable' })]);

    expect(rows[0]?.tokens24h).toBe(null);
    expect(rows[0]?.tokens24hState).toBe('unobservable');
  });
});

describe('同じ呼び名の巣を見分ける', () => {
  it('ぶつかったときだけ一つ上の名前を添える', () => {
    const rows = deriveRows([
      project({ id: 'a', name: 'web', path: '/work/alpha/web' }),
      project({ id: 'b', name: 'web', path: '/work/beta/web' }),
      project({ id: 'c', name: 'lonely', path: '/work/gamma/lonely' }),
    ]);

    expect(rows[0]?.parent).toBe('alpha');
    expect(rows[1]?.parent).toBe('beta');
    expect(rows[2]?.parent, 'ぶつかっていない巣に添えると画面が字で埋まる').toBe(null);
  });

  it('場所が分からない巣には添えるものが無い', () => {
    const rows = deriveRows([
      project({ id: 'a', name: 'web', path: null }),
      project({ id: 'b', name: 'web', path: '/web' }),
    ]);

    expect(rows[0]?.parent).toBe(null);
    expect(rows[1]?.parent, '一つ上が無い場所も添えられない').toBe(null);
  });
});

describe('行の頭の点', () => {
  it('人待ちが最優先', () => {
    expect(dotStateOf(row({ input: 1, active: 3 })), 'この道具のいちばんの用事').toBe('input');
  });

  it('人待ちが無ければ稼働', () => {
    expect(dotStateOf(row({ active: 1 }))).toBe('active');
  });

  it('何も動いていなくても道具が生きていれば待機', () => {
    expect(dotStateOf(row({ liveProcess: true }))).toBe('waiting');
  });

  it('道具も居なければ終了', () => {
    expect(dotStateOf(row())).toBe('ended');
  });
});

describe('既定の並び', () => {
  it('人待ち > 稼働 > 待機 > それ以外の順に置く', () => {
    const rows = [
      row({ id: 'ended' }),
      row({ id: 'input', input: 1 }),
      row({ id: 'waiting', liveProcess: true }),
      row({ id: 'active', active: 1 }),
    ];

    expect(sortRows(rows).map((r) => r.id)).toEqual(['input', 'active', 'waiting', 'ended']);
  });

  it('消費の多さでは順を決めない', () => {
    const rows = [
      row({ id: 'busy-yesterday', tokens24h: 9_000_000 }),
      row({ id: 'waiting-now', input: 1, tokens24h: 0 }),
    ];

    expect(
      sortRows(rows).map((r) => r.id),
      '昨日ぶん回した巣が居座ると、今まさに待っている巣が沈む',
    ).toEqual(['waiting-now', 'busy-yesterday']);
  });

  it('同じ立ち位置なら最終活動の新しい順', () => {
    const rows = [
      row({ id: 'old', active: 1, lastActivityMs: T - 10_000 }),
      row({ id: 'new', active: 1, lastActivityMs: T }),
    ];

    expect(sortRows(rows).map((r) => r.id)).toEqual(['new', 'old']);
  });

  it('時刻まで同じなら名前で決着を付ける', () => {
    const rows = [row({ id: 'b' }), row({ id: 'a' })];

    expect(
      sortRows(rows).map((r) => r.id),
      '決まらないままだと、描き直すたびに並びが揺れる',
    ).toEqual(['a', 'b']);
  });

  it('渡された一覧そのものは並べ替えない', () => {
    const rows = [row({ id: 'b' }), row({ id: 'a' })];
    sortRows(rows);

    expect(rows.map((r) => r.id)).toEqual(['b', 'a']);
  });
});

describe('列を選んで並べ替える', () => {
  it('消費の多い順に並べられる', () => {
    const rows = [row({ id: 'small', tokens24h: 1 }), row({ id: 'big', tokens24h: 100 })];

    expect(sortRows(rows, { key: 'tokens', direction: 'desc' }).map((r) => r.id)).toEqual([
      'big',
      'small',
    ]);
  });

  it('向きを返すと逆になる', () => {
    const rows = [row({ id: 'small', tokens24h: 1 }), row({ id: 'big', tokens24h: 100 })];

    expect(sortRows(rows, { key: 'tokens', direction: 'asc' }).map((r) => r.id)).toEqual([
      'small',
      'big',
    ]);
  });

  it('読めなかった消費は数の後ろに置く', () => {
    const rows = [
      row({ id: 'unknown', tokens24h: null, tokens24hState: 'unobservable' }),
      row({ id: 'zero', tokens24h: 0 }),
    ];

    expect(
      sortRows(rows, { key: 'tokens', direction: 'desc' }).map((r) => r.id),
      '分からない数を 0 と同じ場所に置くと、読めなかったことが消える',
    ).toEqual(['zero', 'unknown']);
  });

  it('呼び名の順にも並べられる', () => {
    const rows = [row({ id: 'b', name: 'zeta' }), row({ id: 'a', name: 'alpha' })];

    expect(sortRows(rows, { key: 'name', direction: 'asc' }).map((r) => r.name)).toEqual([
      'alpha',
      'zeta',
    ]);
  });

  it('既定は立ち位置の降順', () => {
    expect(DEFAULT_SORT).toEqual({ key: 'standing', direction: 'desc' });
  });
});

describe('絞り込み', () => {
  it('呼び名でも場所でも当たる', () => {
    const rows = [
      row({ id: 'a', name: 'web', path: '/work/alpha/web' }),
      row({ id: 'b', name: 'api', path: '/work/beta/api' }),
    ];

    expect(
      filterRows(rows, 'alpha').map((r) => r.id),
      '同じ呼び名を選び分けるには場所が要る',
    ).toEqual(['a']);
    expect(
      filterRows(rows, 'API').map((r) => r.id),
      '大小の区別はしない',
    ).toEqual(['b']);
  });

  it('空の語では絞らない', () => {
    const rows = [row({ id: 'a' }), row({ id: 'b' })];

    expect(filterRows(rows, '   ')).toHaveLength(2);
  });
});

describe('期間で絞る', () => {
  const DAY = 86_400_000;
  const rows = [
    row({ id: 'いま', lastActivityMs: T }),
    row({ id: '三日前', lastActivityMs: T - 3 * DAY }),
    row({ id: '十日前', lastActivityMs: T - 10 * DAY }),
    row({ id: '百日前', lastActivityMs: T - 100 * DAY }),
  ];

  it('既定は 30 日', () => {
    expect(withinSpan(rows, DEFAULT_SPAN, T).map((r) => r.id)).toEqual([
      'いま',
      '三日前',
      '十日前',
    ]);
  });

  it('24 時間へ狭められる', () => {
    expect(withinSpan(rows, '24h', T).map((r) => r.id)).toEqual(['いま']);
  });

  it('すべてなら 1 つも落とさない', () => {
    expect(withinSpan(rows, 'all', T)).toHaveLength(rows.length);
  });

  /* 読めなかったことを「古い」に言い換えると、見に行けていない巣が期間の外に居るように
     見え、観る人には最初から無かったのと同じになる。 */
  it('最終活動の読めない巣は、どの期間でも落とさない', () => {
    const unknown = [row({ id: '読めない', lastActivityMs: null })];

    expect(withinSpan(unknown, '24h', T)).toHaveLength(1);
  });
});

describe('帯と合計', () => {
  it('帯の基準は最も大きい消費', () => {
    expect(tokensCeiling([row({ tokens24h: 10 }), row({ tokens24h: 40 })])).toBe(40);
  });

  it('全部 0 でも 0 で割らない', () => {
    expect(tokensCeiling([row({ tokens24h: 0 })])).toBe(1);
  });

  it('数と待ちを足し上げる', () => {
    const totals = totalsOf([
      row({ active: 1, waiting: 2, input: 1, tokens24h: 100 }),
      row({ active: 3, waiting: 0, input: 0, tokens24h: 50 }),
    ]);

    expect(totals).toEqual({
      active: 4,
      waiting: 2,
      input: 1,
      tokens: 150,
      tokensPartial: false,
    });
  });

  it('読めない巣が混ざったら、合計が全部でないことを印にする', () => {
    const totals = totalsOf([
      row({ tokens24h: 100 }),
      row({ tokens24h: null, tokens24hState: 'unobservable' }),
    ]);

    expect(totals.tokens).toBe(100);
    expect(totals.tokensPartial, '足りない合計を「これで全部だ」という顔で出さない').toBe(true);
  });

  it('窓の外だっただけの巣は、合計を欠けさせない', () => {
    const totals = totalsOf([
      row({ tokens24h: 100 }),
      row({ tokens24h: null, tokens24hState: 'absent' }),
    ]);

    expect(totals.tokensPartial, '静かだったことは分かっている').toBe(false);
  });
});
