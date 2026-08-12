import { describe, expect, it } from 'vitest';
import {
  buildCloses,
  buildTracks,
  closeFlagOf,
  EVENT_SLOTS,
  type EventLog,
  eventLogOf,
  groupTrack,
  openMarkOf,
  trackEndsOf,
  trackLineOf,
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

const trackOf = (issues: readonly Issue[], log: EventLog, id: string, axis = AXIS) => {
  const found = buildTracks(issues, log, buildCloses(issues, log), axis).get(id);
  if (found === undefined) throw new Error(`${id} のトラックが無い`);
  return found;
};

const readOf = (issues: readonly Issue[], log: EventLog, id: string, axis = AXIS) => {
  const track = trackOf(issues, log, id, axis);
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

  /* 記録に `closed` が 2 つ在るなら、いま閉じている状態が始まったのは後のほうである。先に
     閉じた 1 回はその後の `reopened` で解かれている。**開き直しが打ち消すのは、その前の
     `closed` だけである** —— 後の `closed` まで捨てると、閉じた時刻を観測できているのに
     代用へ落ちる。 */
  it('開き直した後にまた閉じたなら、その最後の `closed` を採る', () => {
    const first = NOW - 20 * DAY_MS;
    const again = NOW - 4 * DAY_MS;
    const issues = [issue('#1', { status: 'closed', closed_at: null, updated_at: null })];
    const log = logOf([
      entry('#1', [
        { at: first, kind: 'closed' },
        { at: first + DAY_MS, kind: 'reopened' },
        { at: again, kind: 'closed' },
      ]),
    ]);

    expect(closeOf(issues, log, '#1'), '開き直しの後の 1 回は、まだ解かれていない').toEqual({
      at: again,
      approx: false,
    });
  });

  /* 落とすのはフラグが指している 1 回である。**近いだけの別の 1 回ではない** —— 閉じて
     すぐ開き直してまた閉じた課題で近いほうを落とすと、最後の閉じるがフラグと点の 2 つの形で
     並び、途中の 1 回は消える。2 つの `closed` はどちらも、同じ 1 回として扱う幅の中に在る。 */
  it('落ちるのはフラグと同じ 1 回で、近くの別の 1 回ではない', () => {
    const first = NOW - 6 * DAY_MS;
    const again = first + 2_000;
    const issues = [
      issue('#1', { status: 'closed', closed_at: iso(again), updated_at: iso(again) }),
    ];
    const log = logOf([
      entry('#1', [
        { at: first, kind: 'closed' },
        { at: first + 1_000, kind: 'reopened' },
        { at: again, kind: 'closed' },
      ]),
    ]);
    const marks = readOf(issues, log, '#1').marks;

    expect(marks.length, '残る 2 つは 1 スロットの中に在るので、1 つの点にまとまる').toBe(1);
    expect(marks[0]?.at, '落とす相手を間違えると、点の置かれる時刻が動く').toBe(first);
    expect(marks[0]?.kinds, '途中の 1 回を落とすと、経緯が減って見える').toEqual([
      'closed',
      'reopened',
    ]);
  });

  /* 代用の時刻が、観測した `closed` と同じ時刻に落ちることは在る。**同じ時刻でも、代用と
     観測した 1 回は別である** —— 落とすと、観測できていた 1 回が画面から消えて、残るのは
     観測できていない時刻のフラグだけになる。 */
  it('代用の時刻のフラグでは、`closed` の点を落とさない', () => {
    const at = NOW - 5 * DAY_MS;
    const issues = [issue('#1', { status: 'closed', closed_at: null, updated_at: iso(at) })];
    // 記録のいちばん後が `reopened` なので、閉じた時刻は記録から採れず代用のままになる
    const log = logOf([
      entry('#1', [
        { at, kind: 'closed' },
        { at: at + 2 * DAY_MS, kind: 'reopened' },
      ]),
    ]);

    expect(
      closeOf(issues, log, '#1'),
      '記録から採れないので、閉じた時刻は代用のままである',
    ).toEqual({ at, approx: true });
    expect(
      readOf(issues, log, '#1').marks.flatMap((mark) => mark.kinds),
      '代用の時刻と観測した `closed` は別の 1 回である',
    ).toEqual(['closed', 'reopened']);
  });

  /* 落とす幅を軸から採ると、同じ記録を別の幅で見たときに、点として残るイベントが変わる。
     **幅は見る人が選ぶもので、どのイベントを観測したかは記録の側の事実である。**

     見ているのは、フラグの立つ 1 回を落とした後に何が残るかである。まとめ方は幅で変わってよい
     ——`EVENT_SLOTS` は見分けの付く間隔を決めるものなので、そちらは軸から採るのが正しい。 */
  it('軸の幅を変えても、点として残るイベントは変わらない', () => {
    const closedMs = NOW - 2 * DAY_MS;
    // フラグは `closed_at`、点はその 8 時間前の `closed` —— 1 か月の幅なら 1 スロットの中に入る
    const observedMs = closedMs - 8 * 60 * 60_000;
    const issues = [
      issue('#1', {
        status: 'closed',
        created_at: iso(NOW - 300 * DAY_MS),
        closed_at: iso(closedMs),
        updated_at: iso(closedMs),
      }),
    ];
    const log = logOf([entry('#1', [{ at: observedMs, kind: 'closed' }])]);
    const drawnOn = (axis: { t0: number; t1: number }) =>
      readOf(issues, log, '#1', axis).marks.map((mark) => mark.at);

    expect(drawnOn(AXIS), '8 時間離れた `closed` は、フラグの指す 1 回ではない').toEqual([
      observedMs,
    ]);
    expect(
      drawnOn({ t0: NOW - 7 * DAY_MS, t1: NOW }),
      '幅を切り替えただけで残る点が変わるなら、決めているのは記録ではなく幅である',
    ).toEqual([observedMs]);
  });

  /* 一覧の `closed_at` と記録の `ClosedEvent` は、同じ 1 回を別々の欄に書いたものである。
     GitHub の返す時刻はその 2 つで 1 秒ずれることが在るので、**そこまでは同じ 1 回として
     扱う** —— 扱わないと、閉じた課題の 6 件に 1 件ほどで、フラグのすぐ下に同じ 1 回の点が並ぶ。
     1 分も離れていれば、それは別の 1 回である。 */
  it('1 秒ずれて書かれた同じ 1 回は、フラグと点に分かれない', () => {
    const flagged = NOW - 7 * DAY_MS;
    const near = issue('#1', { status: 'closed', closed_at: iso(flagged), updated_at: null });
    const far = issue('#2', { status: 'closed', closed_at: iso(flagged), updated_at: null });
    const log = logOf([
      entry('#1', [{ at: flagged - 1_000, kind: 'closed' }]),
      entry('#2', [{ at: flagged - 60_000, kind: 'closed' }]),
    ]);

    expect(readOf([near, far], log, '#1').marks.length, '同じ 1 回を 2 つの形で並べない').toBe(0);
    expect(
      readOf([near, far], log, '#2').marks.length,
      '離れた `closed` は別の 1 回なので、点として残る',
    ).toBe(1);
  });
});

/* フラグが立つかどうかは、その時刻を軸の上に置けるかどうかだけで決まる。**両端とも同じ扱い
   である** —— 片側だけを見ていると、軸の外の時刻にフラグが立つ。位置は `atPct` がそのまま
   返すので、軸の外に立てば列の外へ出る。 */
describe('閉じた時刻を軸の上に置く', () => {
  it('軸より前に閉じた課題には、フラグを立てない', () => {
    expect(
      closeFlagOf({ at: AXIS.t0 - DAY_MS, approx: false }, AXIS),
      '軸の外の時刻に立てたフラグは、置けるところを持たない',
    ).toBeNull();
  });

  /* `nowMs` は決まった間隔でしか進まないので、軸の右端より後に閉じた課題を読むことは在る。 */
  it('軸より後に閉じた課題にも、フラグを立てない', () => {
    expect(
      closeFlagOf({ at: AXIS.t1 + DAY_MS, approx: false }, AXIS),
      '左の外だけを断ると、右の外の時刻にはフラグが立つ',
    ).toBeNull();
  });

  it('軸の端ちょうどで閉じたなら、フラグは立つ', () => {
    expect(
      closeFlagOf({ at: AXIS.t0, approx: false }, AXIS)?.pct,
      '端ちょうどは軸の中である。落とすと、幅を狭めた人がフラグを 1 本消したことになる',
    ).toBe(0);
    expect(closeFlagOf({ at: AXIS.t1, approx: false }, AXIS)?.pct).toBe(100);
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

  /* 一覧の `closed_at` と記録の `closed` は、同じ 1 回を 1 秒ずれて書くことが在る。軸の左端が
     その 1 秒の間に落ちると、フラグは軸の中に立ち、フラグが指す 1 回は軸の外に残る。 */
  it('フラグへ移した `closed` が軸の外でも、切れていたことを言う', () => {
    const closedAt = NOW - MONTH_MS;
    const one = issue('#1', {
      status: 'closed',
      closed_at: iso(closedAt),
      updated_at: iso(closedAt),
    });
    const events = [{ at: closedAt - 1_000, kind: 'closed' }];
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
      firstAt: null,
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

/* 線が結ぶのは、観測した時刻のいちばん古いものと新しいものである。**軸を知らないところで
   決まる** —— ここが軸を受け取ると、幅を切り替えただけで結ぶ時刻が動くことになる。 */
describe('線が結ぶ両端', () => {
  const createdMs = NOW - 20 * DAY_MS;
  const narrow = { t0: NOW - 3 * DAY_MS, t1: NOW };

  it('作られた時刻から、最後に観測した時刻まで', () => {
    const issues = [issue('#1')];
    const log = logOf([entry('#1', [{ at: NOW - 8 * DAY_MS, kind: 'comment' }])]);

    expect(trackEndsOf(createdMs, trackOf(issues, log, '#1'), null)).toEqual({
      fromMs: createdMs,
      toMs: NOW - 8 * DAY_MS,
      opened: true,
      closed: false,
      approxTo: false,
    });
  });

  /* 軸の外のイベントも観測した時刻である。**軸で切って端を決めると、幅を狭めた人が
     いつ最後に動いたかを書き換えたことになる。** */
  it('軸を狭めても、結ぶ 2 つの時刻は動かない', () => {
    const issues = [issue('#1')];
    const log = logOf([entry('#1', [{ at: NOW - 8 * DAY_MS, kind: 'comment' }])]);
    const tracks = buildTracks(issues, log, buildCloses(issues, log), narrow);
    const track = tracks.get('#1');
    if (track === undefined) throw new Error('#1 のトラックが無い');

    expect(trackEndsOf(createdMs, track, null), '狭い軸では点が 1 つも置けない行である').toEqual(
      trackEndsOf(createdMs, trackOf(issues, log, '#1'), null),
    );
  });

  it('観測した時刻が 1 つしか無いなら、結ぶ相手が居ないので線は無い', () => {
    const issues = [issue('#1')];
    const log = logOf([entry('#1', [])]);

    expect(
      trackEndsOf(createdMs, trackOf(issues, log, '#1'), null),
      '長さの無い線は、観測していない何かがそこに在ることになる',
    ).toBe(null);
  });

  it('開いた時刻を読めていないなら、いちばん古いイベントが始まりになる', () => {
    const issues = [issue('#1')];
    const log = logOf([
      entry('#1', [
        { at: NOW - 9 * DAY_MS, kind: 'comment' },
        { at: NOW - 4 * DAY_MS, kind: 'comment' },
      ]),
    ]);

    expect(
      trackEndsOf(null, trackOf(issues, log, '#1'), null),
      '読めなかった時刻を始まりに置くと、観測に化ける',
    ).toEqual({
      fromMs: NOW - 9 * DAY_MS,
      toMs: NOW - 4 * DAY_MS,
      opened: false,
      closed: false,
      approxTo: false,
    });
  });

  /* 閉じた時刻が `updated_at` の代用なら、線の終わりも観測した時刻ではない。
   **代用かどうかは軸を知らないところで決まっているので、ここで判じ直さない。** */
  it('代用の時刻で閉じたなら、終わりが代用であることを持って返す', () => {
    const issues = [issue('#1')];
    const log = logOf([entry('#1', [])]);
    const close = { at: NOW - 6 * DAY_MS, approx: true };

    expect(trackEndsOf(createdMs, trackOf(issues, log, '#1'), close)).toEqual({
      fromMs: createdMs,
      toMs: close.at,
      opened: true,
      closed: true,
      approxTo: true,
    });
  });

  /* 端が軸の端ちょうどへ潰れる行も在る。**幅の無い線を置かない** —— 置ける時刻が
     1 つに潰れているのだから、そこに在るのは点であって線ではない。 */
  it('両端が軸の端で同じところへ潰れるなら、線は無い', () => {
    const ends = {
      fromMs: NOW - 20 * DAY_MS,
      toMs: NOW - 10 * DAY_MS,
      opened: true,
      closed: false,
      approxTo: false,
    };

    expect(trackLineOf(ends, narrow), '端で止めて引くと、観測していない 3 日を線が主張する').toBe(
      null,
    );
    expect(
      trackLineOf({ ...ends, toMs: narrow.t0 }, narrow),
      '終わりが軸の端ちょうどでも、置ける時刻は 1 つに潰れている',
    ).toBe(null);
    expect(trackLineOf(ends, AXIS)?.softFrom, '軸の中に収まる端をぼかさない').toBe(false);
  });

  /* 終わりが軸の先に在る行。**代用でなくてもぼかす** —— `nowMs` は決まった間隔でしか進まない
     ので軸の右端より後のイベントを読むことは在り、そこを硬い端で描くと、軸の右端で最後に
     動いたことになる。 */
  it('最後に観測した時刻が軸の先なら、終わりの端をぼかす', () => {
    const line = trackLineOf(
      {
        fromMs: NOW - 10 * DAY_MS,
        toMs: NOW + DAY_MS,
        opened: true,
        closed: false,
        approxTo: false,
      },
      AXIS,
    );

    expect(line?.softTo, '軸の端で止めた位置は、誰も観測していない時刻である').toBe(true);
    expect(line?.softFrom, '軸の中に収まる端はぼかさない').toBe(false);
  });
});

/* 作られた時刻の輪だけは、軸の外でも置く。**始まりはどの課題にも在るからである** ——
   閉じたかどうかは答えない課題が在るのでフラグは端に寄せられないが、開いた時刻は
   読めた課題なら必ず在る。落とすと、幅を狭めただけで「まだ無かった課題」の絵になる。 */
describe('作られた時刻の輪', () => {
  it('軸の中の時刻は、その位置に置く', () => {
    expect(openMarkOf(NOW - 15 * DAY_MS, AXIS)).toEqual({
      at: NOW - 15 * DAY_MS,
      pct: (15 / 30) * 100,
      clamped: null,
    });
  });

  it('軸の端ちょうどは寄せたことにしない', () => {
    expect(openMarkOf(AXIS.t0, AXIS), '端ちょうどは観測した時刻そのものである').toEqual({
      at: AXIS.t0,
      pct: 0,
      clamped: null,
    });
    expect(openMarkOf(AXIS.t1, AXIS)).toEqual({ at: AXIS.t1, pct: 100, clamped: null });
  });

  /* 寄せた輪が持つ時刻は本当の時刻である。**位置だけを端に寄せる** —— 時刻まで端に
     合わせると、幅を選んだ人が課題の開いた日を書き換えたことになる。 */
  it('軸の外の時刻は端に寄せ、寄せたことを持って返す', () => {
    expect(openMarkOf(AXIS.t0 - 1, AXIS)).toEqual({
      at: AXIS.t0 - 1,
      pct: 0,
      clamped: 'before',
    });
    expect(openMarkOf(AXIS.t1 + 1, AXIS)).toEqual({
      at: AXIS.t1 + 1,
      pct: 100,
      clamped: 'after',
    });
  });

  it('読めなかった時刻には輪を置かない', () => {
    expect(openMarkOf(null, AXIS), '読めない時刻を端に置くと、観測に化ける').toBe(null);
    expect(openMarkOf(Number.NaN, AXIS)).toBe(null);
  });
});

/* 課題をいくつか束ねた 1 本のトラック。マイルストーンの行が使う。

   **新しい観測ではない。** 束に起きたことは、その課題たちに起きたことを合わせたものである。
   だから見るのは 2 つ —— 合わせた並びの上で近すぎる点が 1 つになること、そして束の中に
   読めていない課題が在ることを黙らないこと。 */
describe('課題を束ねたトラック', () => {
  const at = (daysAgo: number): number => NOW - daysAgo * DAY_MS;

  it('別々の課題のイベントが、1 本の並びの上でまとまる', () => {
    const issues = [issue('#1'), issue('#2')];
    const log = logOf([
      entry('#1', [
        { at: at(10), kind: 'comment' },
        { at: at(4), kind: 'closed' },
      ]),
      entry('#2', [{ at: at(10) + SLOT / 4, kind: 'labeled' }]),
    ]);
    const { track } = groupTrack(issues, log, AXIS);
    if (track.kind !== 'read') throw new Error('read ではない');

    expect(track.count, '束の件数は合わせた件数である。課題ごとに数え落とさない').toBe(3);
    expect(track.marks.length, '課題ごとにまとめてから重ねると、同じ時刻に 2 つの点が並ぶ').toBe(2);
    expect(track.marks[0]?.count).toBe(2);
    expect(track.marks[0]?.kinds).toEqual(['comment', 'labeled']);
    expect(track.marks[1]?.kinds).toEqual(['closed']);
  });

  /* 束の中の 1 件だけが記録に居ないことは在る。**線はもう束の全部を語っていない** ——
     黙って束ねると、読めた課題だけの絵が束の絵として出る。 */
  it('記録に居なかった課題の数を、別に持って返す', () => {
    const issues = [issue('#1'), issue('#2'), issue('#3')];
    const log = logOf([entry('#1', [{ at: at(10), kind: 'comment' }])]);
    const { track, unread } = groupTrack(issues, log, AXIS);

    expect(unread, '2 件ぶんの起きたことは、この線に入っていない').toBe(2);
    expect(track.kind, '読めた 1 件は読めているので、束ごと読めなかったことにしない').toBe('read');
  });

  it('1 件も記録に居なければ、読めなかった束として返す', () => {
    const issues = [issue('#1'), issue('#2')];
    const { track, unread } = groupTrack(issues, logOf([entry('#9', [])]), AXIS);

    expect(unread).toBe(2);
    expect(track.kind, '点の無いトラックは「起きなかった」という別の答えである').toBe('unread');
    expect(track.kind === 'unread' ? track.why : null).toBe('row');
  });

  /* **束の記録は、その課題たちの記録を合わせたものである。** だから読み切れなかったか
     どうかは、束のどれか 1 件でも切れていれば切れている。 */
  it('1 件でも読み切れていなければ、束も読み切れていない', () => {
    const issues = [issue('#1'), issue('#2')];
    const log = logOf([
      entry('#1', [{ at: at(12), kind: 'comment' }], true),
      entry('#2', [{ at: at(10), kind: 'comment' }]),
    ]);
    const { track } = groupTrack(issues, log, AXIS);

    expect(
      track.kind === 'read' ? track.cut !== null : false,
      '後から見た 1 件で上書きすると、先に見た切れ目がどこにも残らない',
    ).toBe(true);
  });

  /* 束の始まりは、いちばん早く作られた課題である。読み残しの区間はそこから引く —— 後から
     作られた課題を始まりにすると、区間が短く出て読み残しが少なく見える。 */
  it('束の始まりは、いちばん早く作られた課題である', () => {
    const issues = [
      issue('#1', { created_at: iso(at(25)) }),
      issue('#2', { created_at: iso(at(9)) }),
    ];
    const log = logOf([
      entry('#1', [{ at: at(8), kind: 'comment' }], true),
      entry('#2', [{ at: at(8), kind: 'comment' }]),
    ]);
    const { track } = groupTrack(issues, log, AXIS);

    expect(track.kind === 'read' ? track.cut?.fromMs : null).toBe(at(25));
  });

  /* 課題が閉じた 1 回は、束にとっては起きたことの 1 つである。**フラグへは移さない** ——
     移すと、束の中で片付いた 1 件が、束の上からは何も起きなかったように見える。 */
  it('課題の閉じた 1 回も、点として残る', () => {
    const issues = [issue('#1', { status: 'closed', closed_at: iso(at(6)) })];
    const log = logOf([entry('#1', [{ at: at(6), kind: 'closed' }])]);
    const { track } = groupTrack(issues, log, AXIS);

    expect(
      track.kind === 'read' ? track.marks.flatMap((mark) => mark.kinds) : null,
      '束は閉じないので、落とす先のフラグがそもそも無い',
    ).toEqual(['closed']);
  });

  it('読んでいる最中と、記録が無いことは、そのまま束にも伝わる', () => {
    const issues = [issue('#1')];

    expect(groupTrack(issues, { kind: 'reading' }, AXIS)).toEqual({
      track: { kind: 'reading' },
      unread: 0,
      openedMs: null,
    });
    expect(groupTrack(issues, { kind: 'absent' }, AXIS).track.kind).toBe('nolog');
  });
});
