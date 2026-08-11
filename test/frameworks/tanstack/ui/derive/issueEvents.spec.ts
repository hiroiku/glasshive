import { describe, expect, it } from 'vitest';
import {
  buildCloses,
  buildTracks,
  EVENT_SLOTS,
  type EventLog,
  eventLogOf,
} from '~/frameworks/tanstack/ui/derive/issueEvents.ts';
import { MONTH_MS } from '~/frameworks/tanstack/ui/derive/issueGantt.ts';
import { DAY_MS } from '~/frameworks/tanstack/ui/derive/timeWindow.ts';

/* 一覧の右のトラックに置く点。**観測した時刻しか置かない。**

   見るのは 2 つ —— 近すぎる点をまとめても、置く位置が観測した時刻のままであること、そして
   「読んでいる最中」「無かった」「観測できなかった」「読んで 0 件だった」が別の答えとして
   残ること。この 4 つが崩れるとき、画面は嘘を吐くが誰も気付けない。 */

type Issue = Parameters<typeof buildTracks>[0][number];
type Answer = Parameters<typeof eventLogOf>[2];

const NOW = Date.parse('2026-08-09T12:00:00Z');
const AXIS = { t0: NOW - MONTH_MS, t1: NOW };
const SLOT = MONTH_MS / EVENT_SLOTS;

const iso = (atMs: number): string => new Date(atMs).toISOString();

const issue = (id: string, over: Partial<Issue> = {}): Issue =>
  ({
    id,
    title: `title ${id}`,
    status: 'open',
    issue_type: null,
    labels: null,
    assignee: null,
    created_at: iso(NOW - 20 * DAY_MS),
    updated_at: null,
    closed_at: null,
    deps: [],
    deps_complete: true,
    github: {
      url: null,
      labels: [],
      assignees: [],
      author: null,
      milestone: null,
      issue_type_color: null,
      sub_issues: null,
      pull_requests: [],
      comments: 0,
      reactions: 0,
    },
    ...over,
  }) as Issue;

const entry = (id: string, events: readonly { at: number; kind: string }[], truncated = false) => ({
  id,
  events: events.map((event) => ({ at: iso(event.at), kind: event.kind })),
  truncated,
});

const logOf = (issues: readonly ReturnType<typeof entry>[], complete = true): EventLog =>
  eventLogOf(false, false, {
    ok: true,
    body: { state: 'observed', reason: null, issues: [...issues], complete },
  } as Answer);

const closeOf = (issues: readonly Issue[], log: EventLog, id: string) =>
  buildCloses(issues, log).get(id) ?? null;

const trackOf = (issues: readonly Issue[], log: EventLog, id: string) => {
  const found = buildTracks(issues, log, buildCloses(issues, log), AXIS).get(id);
  if (found === undefined) throw new Error(`${id} のトラックが無い`);
  return found;
};

const readOf = (issues: readonly Issue[], log: EventLog, id: string) => {
  const track = trackOf(issues, log, id);
  if (track.kind !== 'read') throw new Error(`${id} は read ではない`);
  return track;
};

describe('近すぎる点をまとめる', () => {
  it('同じスロットに入る 2 つのイベントが 1 つの点にまとまる', () => {
    const at = NOW - 10 * DAY_MS;
    const track = readOf(
      [issue('#1')],
      logOf([
        entry('#1', [
          { at, kind: 'comment' },
          { at: at + SLOT / 4, kind: 'labeled' },
        ]),
      ]),
      '#1',
    );

    expect(track.marks.length).toBe(1);
    expect(track.marks[0]?.count).toBe(2);
    expect(track.marks[0]?.kinds).toEqual(['comment', 'labeled']);
  });

  it('まとまった点は先頭のイベントの時刻に置かれる', () => {
    const at = NOW - 10 * DAY_MS;
    const track = readOf(
      [issue('#1')],
      logOf([
        entry('#1', [
          { at, kind: 'comment' },
          { at: at + SLOT / 2, kind: 'comment' },
        ]),
      ]),
      '#1',
    );

    expect(track.marks[0]?.at, '中点も平均も、誰も観測していない時刻である').toBe(at);
    expect(track.marks[0]?.lastAt).toBe(at + SLOT / 2);
  });

  it('隣り合う点は必ず軸の 1/30 以上離れる', () => {
    const from = NOW - 15 * DAY_MS;
    const packed = Array.from({ length: 30 }, (_, index) => ({
      at: from + index * 2000,
      kind: 'comment',
    }));
    const spread = Array.from({ length: 30 }, (_, index) => ({
      at: from + index * (SLOT * 0.9),
      kind: 'comment',
    }));

    expect(
      readOf([issue('#1')], logOf([entry('#1', packed)]), '#1').marks.length,
      '1 分間に押し込んだ 30 件は 1 つの点である',
    ).toBe(1);

    /* 直前のイベントと比べていると、0.9 スロットずつずれた列が 1 つの点のまま軸を渡り切る。
       比べる相手はいつも重なりの先頭でなければならない。

       **まず点が 2 つ以上に分かれていることを確かめる。** 1 つにまとまってしまうと、下の
       ループは 1 周目で終わり、隣り合う点の間隔を 1 度も見ないまま通ってしまう。 */
    const marks = readOf([issue('#1')], logOf([entry('#1', spread)]), '#1').marks;
    expect(marks.length, '0.9 スロットずつ離れた 17 件が 1 つの点にまとまるはずがない').toBe(9);
    for (const [index, mark] of marks.entries()) {
      const previous = marks[index - 1];
      if (previous === undefined) continue;
      expect(mark.at - previous.at).toBeGreaterThanOrEqual(SLOT);
    }
  });

  it('軸の外のイベントは端に寄せずに落とす', () => {
    const track = readOf(
      [issue('#1')],
      logOf([
        entry('#1', [
          { at: NOW - 90 * DAY_MS, kind: 'comment' },
          { at: NOW - 5 * DAY_MS, kind: 'comment' },
        ]),
      ]),
      '#1',
    );

    expect(track.marks.length, '端へ寄せた点は、誰も観測していない時刻を指す').toBe(1);
    expect(track.count, '軸の外へ落ちたイベントも、読めた件数には数える').toBe(2);
  });
});

/* いつ閉じたかは記録の側の事実であって、見ている幅の話ではない。**だから軸を渡さない** ——
   ここが軸を受け取ると、幅を切り替えただけで、観測した時刻が代用に変わることになる。
   軸が決めてよいのは、その時刻をフラグとして立てられるかどうかだけである。 */
describe('いつ閉じたか', () => {
  const closed = (at: number) =>
    issue('#1', { status: 'closed', closed_at: iso(at), updated_at: iso(at) });

  it('フラグが立つ `closed` のイベントは 1 つだけ落ちる', () => {
    const at = NOW - 3 * DAY_MS;
    const track = readOf(
      [closed(at)],
      logOf([
        entry('#1', [
          { at: at - 10 * DAY_MS, kind: 'closed' },
          { at: at - 9 * DAY_MS, kind: 'reopened' },
          { at, kind: 'closed' },
        ]),
      ]),
      '#1',
    );

    const kinds = track.marks.flatMap((mark) => mark.kinds);
    expect(kinds, '閉じて開き直してまた閉じた課題の、途中の 1 回まで消さない').toEqual([
      'closed',
      'reopened',
    ]);
    expect(track.count, '落とすのは描き方の話で、読めた件数は減らない').toBe(3);
  });

  it('`closed_at` が在っても読めなければ、代用だと言う', () => {
    const issues = [
      issue('#1', {
        status: 'closed',
        closed_at: '2026-13-45T99:00:00Z',
        updated_at: iso(NOW - 3 * DAY_MS),
      }),
    ];

    expect(
      closeOf(issues, logOf([entry('#1', [])]), '#1'),
      '値が在るだけで読めていない時刻を、観測した時刻の顔で出さない',
    ).toEqual({ at: NOW - 3 * DAY_MS, approx: true });
  });

  it('代用の時刻より、記録に読めた `closed` を採る', () => {
    const observedAt = NOW - 10 * DAY_MS;
    const issues = [
      issue('#1', { status: 'closed', closed_at: null, updated_at: iso(NOW - 3 * DAY_MS) }),
    ];
    const log = logOf([entry('#1', [{ at: observedAt, kind: 'closed' }])]);

    expect(closeOf(issues, log, '#1'), 'イベントとして読めた時刻は代用ではない').toEqual({
      at: observedAt,
      approx: false,
    });
    expect(readOf(issues, log, '#1').marks.length, 'フラグの立つ 1 回を、点としても残さない').toBe(
      0,
    );
  });

  /* 幅は見る人が選ぶもので、閉じた時刻は記録の側の事実である。**軸の外の `closed` も同じ
     ように採る** —— 採らないと、`1w` を押しただけで観測した時刻が代用に化ける。 */
  it('軸の外の `closed` も、同じように採る', () => {
    const observedAt = NOW - 40 * DAY_MS;
    const issues = [
      issue('#1', { status: 'closed', closed_at: null, updated_at: iso(NOW - 3 * DAY_MS) }),
    ];
    const log = logOf([entry('#1', [{ at: observedAt, kind: 'closed' }])]);

    expect(closeOf(issues, log, '#1'), '幅を狭めると、読めていた時刻が代用になる').toEqual({
      at: observedAt,
      approx: false,
    });
    expect(
      readOf(issues, log, '#1').before?.count,
      'そこにフラグは立たないのだから、端で数えるはずの 1 件まで落とさない',
    ).toBe(1);
  });

  /* 一覧が `closed_at` も `updated_at` も返さないことは在る。**記録に読めた `closed` が
     在るのに黙ると、閉じたことは分かっているのに閉じていない課題と同じ絵になる。** */
  it('一覧の時刻をどちらも読めなくても、記録に読めた `closed` が在れば採る', () => {
    const observedAt = NOW - 10 * DAY_MS;
    const issues = [issue('#1', { status: 'closed', closed_at: null, updated_at: null })];
    const log = logOf([entry('#1', [{ at: observedAt, kind: 'closed' }])]);

    expect(closeOf(issues, log, '#1'), '観測した時刻が手元に在るのに、無いことにしない').toEqual({
      at: observedAt,
      approx: false,
    });
  });

  it('後で開き直された `closed` は、いま閉じている時刻ではない', () => {
    const undone = NOW - 20 * DAY_MS;
    const issues = [
      issue('#1', { status: 'closed', closed_at: null, updated_at: iso(NOW - 3 * DAY_MS) }),
    ];
    const log = logOf([
      entry('#1', [
        { at: undone, kind: 'closed' },
        { at: undone + DAY_MS, kind: 'reopened' },
      ]),
    ]);

    expect(
      closeOf(issues, log, '#1'),
      'いま閉じている状態が指す時刻は、まだ観測できていない',
    ).toEqual({ at: NOW - 3 * DAY_MS, approx: true });
    expect(
      readOf(issues, log, '#1').marks.flatMap((mark) => mark.kinds),
      '採らないのだから、その 1 回は点として残る',
    ).toEqual(['closed', 'reopened']);
  });

  it('閉じていない課題の `closed` は点として残る', () => {
    const at = NOW - 3 * DAY_MS;
    const issues = [issue('#1')];
    const log = logOf([entry('#1', [{ at, kind: 'closed' }])]);

    expect(
      closeOf(issues, log, '#1'),
      '開いている課題の `closed` は経緯であって、閉じた時刻ではない',
    ).toBeNull();
    expect(readOf(issues, log, '#1').marks.length).toBe(1);
  });
});

describe('読み切れなかった区間', () => {
  it('`truncated` のとき、区間は `created_at` から手元のいちばん古いイベントまでになる', () => {
    const track = readOf(
      [issue('#1', { created_at: iso(NOW - 20 * DAY_MS) })],
      logOf([entry('#1', [{ at: NOW - 8 * DAY_MS, kind: 'comment' }], true)]),
      '#1',
    );

    expect(track.cut?.fromMs).toBe(NOW - 20 * DAY_MS);
    expect(track.cut?.toMs).toBe(NOW - 8 * DAY_MS);
    expect(track.cut?.softFrom, '両端とも観測した時刻なので、ぼかさない').toBe(false);
    expect(track.cut?.left).toBeCloseTo((10 / 30) * 100, 5);
    expect(track.cut?.width).toBeCloseTo((12 / 30) * 100, 5);
  });

  it('`created_at` を読めないとき、区間は `soft` になる', () => {
    const track = readOf(
      [issue('#1', { created_at: null })],
      logOf([entry('#1', [{ at: NOW - 8 * DAY_MS, kind: 'comment' }], true)]),
      '#1',
    );

    expect(track.cut?.softFrom, 'ぼかした端は「どこから始まるか分からない」である').toBe(true);
    expect(track.cut?.fromMs).toBeNull();
  });

  it('切れていて 1 件も残っていないなら、罫線ではなくハッチを掛ける', () => {
    const track = trackOf([issue('#1')], logOf([entry('#1', [], true)]), '#1');

    expect(track, '読み切れなかった行を「何も起きなかった行」と同じ絵にしない').toEqual({
      kind: 'unread',
      why: 'cut',
      dropped: 0,
      truncated: true,
    });
  });

  it('軸の左端ちょうどに在るイベントでも、切れていたことを言う', () => {
    const at = NOW - MONTH_MS;
    const cutting = readOf(
      [issue('#1', { created_at: iso(NOW - 90 * DAY_MS) })],
      logOf([entry('#1', [{ at, kind: 'comment' }], true)]),
      '#1',
    );

    expect(
      cutting.cut,
      '端ちょうどのイベントが、切れていたことを持って行ってしまう',
    ).not.toBeNull();
    expect(cutting.cut?.width, '記録の始まりが軸の左端なので、区間に幅は無い').toBe(0);
    expect(cutting.cut?.softTo, '右端は観測した時刻で、軸の中に在る').toBe(false);
    expect(cutting.before, '軸の外に落ちたイベントは 1 つも無い').toBeNull();

    const whole = readOf(
      [issue('#1', { created_at: iso(NOW - 90 * DAY_MS) })],
      logOf([entry('#1', [{ at, kind: 'comment' }])]),
      '#1',
    );

    expect(whole.cut, '切れていない行と同じ絵にすると、読み残しがどこにも残らない').toBeNull();
  });

  it('フラグへ移した `closed` が軸の外でも、切れていたことを言う', () => {
    const closedAt = NOW - MONTH_MS + DAY_MS / 4;
    const one = issue('#1', {
      status: 'closed',
      closed_at: iso(closedAt),
      updated_at: iso(closedAt),
    });
    const events = [{ at: closedAt - DAY_MS / 2, kind: 'closed' }];
    const cutting = readOf([one], logOf([entry('#1', events, true)]), '#1');

    expect(
      cutting.before,
      'フラグへ移した 1 件は並びから外れるので、端の件数には数えられない',
    ).toBeNull();
    expect(
      cutting.cut,
      '数える相手が居ないときまで端の件数に任せると、読み残しが消える',
    ).not.toBeNull();
    expect(cutting.cut?.softTo, '記録の始まりは軸の外なので、端で止めて描いている').toBe(true);
    expect(readOf([one], logOf([entry('#1', events)]), '#1').cut).toBeNull();
  });

  it('記録の始まりが軸の右の外なら、右端をぼかす', () => {
    const track = readOf(
      [issue('#1')],
      logOf([entry('#1', [{ at: NOW + 30 * DAY_MS, kind: 'comment' }], true)]),
      '#1',
    );

    expect(track.cut?.softTo, '端で止めた線を硬く引くと、誰も観測していない時刻を指す').toBe(true);
  });

  it('区間が丸ごと軸の外なら、区間は引かずに左端の件数が言う', () => {
    const track = readOf(
      [issue('#1', { created_at: iso(NOW - 90 * DAY_MS) })],
      logOf(
        [
          entry(
            '#1',
            [
              { at: NOW - 60 * DAY_MS, kind: 'comment' },
              { at: NOW - 5 * DAY_MS, kind: 'comment' },
            ],
            true,
          ),
        ],
        true,
      ),
      '#1',
    );

    expect(track.cut, '軸の外へ区間を引くと、置けない場所を指す').toBeNull();
    expect(track.before?.count, '黙って落とすと、切れていたことがどこにも残らない').toBe(1);
    expect(track.before?.cut).toBe(true);
  });

  it('切っていないなら区間も無い', () => {
    const track = readOf(
      [issue('#1')],
      logOf([entry('#1', [{ at: NOW - 8 * DAY_MS, kind: 'comment' }])]),
      '#1',
    );

    expect(track.cut).toBeNull();
  });
});

describe('時刻を読めなかったイベント', () => {
  it('どれも読めなければ、罫線ではなくハッチを掛ける', () => {
    const track = trackOf(
      [issue('#1')],
      logOf([{ id: '#1', events: [{ at: '', kind: 'comment' }], truncated: false }]),
      '#1',
    );

    expect(track, '手渡された 1 件が「何も起きなかった」と言うことになる').toEqual({
      kind: 'unread',
      why: 'unreadable',
      dropped: 1,
      truncated: false,
    });
  });

  it('読めなかったうえに切れていたなら、その両方を持つ', () => {
    const track = trackOf(
      [issue('#1')],
      logOf([{ id: '#1', events: [{ at: 'soon', kind: 'comment' }], truncated: true }]),
      '#1',
    );

    expect(track, '理由を 1 つに決めると、もう片方が黙って落ちる').toEqual({
      kind: 'unread',
      why: 'unreadable',
      dropped: 1,
      truncated: true,
    });
  });

  it('一部だけ読めなければ、読めた件数と落とした件数を分けて持つ', () => {
    const track = readOf(
      [issue('#1')],
      logOf([
        {
          id: '#1',
          events: [
            { at: iso(NOW - 5 * DAY_MS), kind: 'comment' },
            { at: 'soon', kind: 'labeled' },
          ],
          truncated: false,
        },
      ]),
      '#1',
    );

    expect(track.count, '読めた件数に、読めなかったものを混ぜない').toBe(1);
    expect(track.dropped, '落としたことを言わないと、件数が黙って減る').toBe(1);
  });
});

describe('軸の外に落ちたイベント', () => {
  it('左右それぞれ、件数と軸にいちばん近い時刻を持つ', () => {
    const track = readOf(
      [issue('#1')],
      logOf([
        entry('#1', [
          { at: NOW - 90 * DAY_MS, kind: 'comment' },
          { at: NOW - 40 * DAY_MS, kind: 'comment' },
          { at: NOW - 5 * DAY_MS, kind: 'comment' },
        ]),
      ]),
      '#1',
    );

    expect(track.marks.length).toBe(1);
    expect(
      track.before?.count,
      '落としたことを言わないと、5 件の課題と 0 件の課題が同じ絵になる',
    ).toBe(2);
    expect(track.before?.at, '添えるのは軸にいちばん近いものである').toBe(NOW - 40 * DAY_MS);
    expect(track.before?.cut, '切れていないので、読み残しの話ではない').toBe(false);
    expect(track.after).toBeNull();
  });
});

describe('4 つの状態は、どれも別の答えである', () => {
  it('読んでいる最中', () => {
    expect(eventLogOf(true, false, null).kind).toBe('reading');
    expect(trackOf([issue('#1')], { kind: 'reading' }, '#1')).toEqual({ kind: 'reading' });
  });

  it('読むものが無かった', () => {
    const log = eventLogOf(false, false, {
      ok: true,
      body: { state: 'absent', reason: null, issues: [], complete: false },
    } as Answer);

    expect(log.kind).toBe('absent');
    expect(trackOf([issue('#1')], log, '#1')).toEqual({ kind: 'nolog' });
  });

  it('観測できなかった', () => {
    const log = eventLogOf(false, false, {
      ok: true,
      body: { state: 'unobservable', reason: 'gh exited 1', issues: [], complete: false },
    } as Answer);

    expect(log).toEqual({ kind: 'unobservable', reason: 'gh exited 1' });
    expect(trackOf([issue('#1')], log, '#1')).toEqual({
      kind: 'unread',
      why: 'log',
      dropped: 0,
      truncated: false,
    });
  });

  it('取りに行けなかったのも、観測できなかったである', () => {
    expect(eventLogOf(false, true, null)).toEqual({ kind: 'unobservable', reason: null });
    expect(
      eventLogOf(false, false, {
        ok: false,
        status: 503,
        body: { state: 'unobservable', code: 'issues.gh_failed', message: 'gh is not installed' },
      } as Answer),
    ).toEqual({ kind: 'unobservable', reason: 'gh is not installed' });
  });

  it('読んでイベントが 0 件だった', () => {
    const track = trackOf([issue('#1')], logOf([entry('#1', [])]), '#1');

    expect(track, '読めなかった行と同じ絵にしてはいけない').toEqual({
      kind: 'read',
      marks: [],
      count: 0,
      dropped: 0,
      lastAt: null,
      cut: null,
      before: null,
      after: null,
    });
  });
});

describe('全部の課題を辿れなかったとき', () => {
  it('`byId` に居ない行だけが `unread` になり、居る行は `read` のまま', () => {
    const issues = [issue('#1'), issue('#2')];
    const log = logOf([entry('#1', [{ at: NOW - 5 * DAY_MS, kind: 'comment' }])], false);

    expect(trackOf(issues, log, '#1').kind, 'ここで読めた行まで沈めない').toBe('read');
    expect(trackOf(issues, log, '#2')).toEqual({
      kind: 'unread',
      why: 'row',
      dropped: 0,
      truncated: false,
    });
  });

  it('イベントが 0 件で並びに居る行は、読めた行である', () => {
    const issues = [issue('#1')];
    const log = logOf([entry('#1', [])], false);

    expect(
      trackOf(issues, log, '#1').kind,
      '並びに居ることが「この課題は読んだ」という観測そのものである',
    ).toBe('read');
  });
});
