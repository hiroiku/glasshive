import { describe, expect, it } from 'vitest';
import {
  atPct,
  DEFAULT_GANTT_WINDOW,
  formatGanttTick,
  GANTT_WINDOWS,
  ganttAxis,
  ganttGridImage,
  ganttGuides,
  ganttTicks,
  MIN_GANTT_SPAN_MS,
  MONTH_MS,
  QUARTER_MS,
  WEEK_MS,
} from '~/frameworks/tanstack/ui/derive/issueGantt.ts';
import { DAY_MS } from '~/frameworks/tanstack/ui/derive/timeWindow.ts';

/* 課題の時間軸に描いてよいのは観測した時刻だけである。

   見るのは 3 つ —— 軸の両端が観測した時刻から決まること、期日の読めないマイルストーンが
   線を出さないこと、そして軸から外れた期日が黙って落ちずに `where` で返ること。 */

/* 課題の形は、軸を組む実装そのものから引く。ここは外部 API の形を宣言した層を `import` できない。 */
type IssueSummaryJson = Parameters<typeof ganttGuides>[0][number];

const NOW = Date.parse('2026-08-09T12:00:00Z');

const iso = (atMs: number): string => new Date(atMs).toISOString();

const issue = (over: Partial<IssueSummaryJson> = {}): IssueSummaryJson =>
  ({
    id: '#1',
    title: 'Widen the health check window',
    status: 'open',
    issue_type: null,
    labels: null,
    assignee: null,
    created_at: null,
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
  }) as IssueSummaryJson;

const withMilestone = (
  id: string,
  title: string,
  dueOn: string | null,
  over: Partial<IssueSummaryJson> = {},
): IssueSummaryJson => {
  const base = issue({ id, ...over });
  return { ...base, github: { ...base.github, milestone: { title, due_on: dueOn } } };
};

describe('選べる幅', () => {
  it('既定は `all`', () => {
    expect(DEFAULT_GANTT_WINDOW).toBe('all');
    expect(GANTT_WINDOWS[0]?.key, '広く見えている状態から絞り込ませる').toBe('all');
  });

  it('週より広い幅を持つ', () => {
    const keys = GANTT_WINDOWS.map((preset) => preset.key);

    expect(keys, '課題は週や月の単位で生きているので、7d までの語彙では足りない').toEqual([
      'all',
      WEEK_MS,
      MONTH_MS,
      QUARTER_MS,
    ]);
  });

  it('ラベルもタイトルも英語である', () => {
    for (const preset of GANTT_WINDOWS) {
      expect(preset.label).toMatch(/^[\x20-\x7e]+$/);
      expect(preset.title).toMatch(/^[\x20-\x7e]+$/);
    }
  });
});

describe('軸の両端', () => {
  it('決まった幅は現在で終わり、その幅だけ遡る', () => {
    expect(ganttAxis([], MONTH_MS, NOW)).toEqual({ t0: NOW - MONTH_MS, t1: NOW });
  });

  it('`all` はいちばん古い課題が収まるところまで遡る', () => {
    const issues = [
      issue({ id: '#1', created_at: iso(NOW - 200 * DAY_MS) }),
      issue({ id: '#2', created_at: iso(NOW - 3 * DAY_MS) }),
    ];

    expect(ganttAxis(issues, 'all', NOW)).toEqual({ t0: NOW - 200 * DAY_MS, t1: NOW });
  });

  it('`all` は `created_at` を読めない課題を数に入れない', () => {
    const issues = [
      issue({ id: '#1', created_at: 'not a date' }),
      issue({ id: '#2', created_at: iso(NOW - 5 * DAY_MS) }),
    ];

    expect(ganttAxis(issues, 'all', NOW).t0).toBe(NOW - 5 * DAY_MS);
  });

  it('`all` で読める `created_at` が 1 つも無ければ、決まった幅へ落とす', () => {
    const axis = ganttAxis([issue({ created_at: null })], 'all', NOW);

    expect(axis.t1, '幅の無い軸に載せると、全部の点が同じ位置へ重なる').toBeGreaterThan(axis.t0);
    expect(axis.t1).toBe(NOW);
  });

  it('`created_at` が未来を指していても、幅は残る', () => {
    const axis = ganttAxis([issue({ created_at: iso(NOW + 5 * DAY_MS) })], 'all', NOW);

    expect(axis.t1 - axis.t0).toBeGreaterThanOrEqual(MIN_GANTT_SPAN_MS);
  });

  /* 期日は素材の中で唯一先を指す日付で、まだ来ていないから期日である。
     現在で軸を切ると、締め切りの線は必ず外に落ちて 1 本も描かれない。 */
  it('マイルストーンの期日まで右へ伸びる', () => {
    const issues = [
      issue({ id: '#1', created_at: iso(NOW - 20 * DAY_MS) }),
      withMilestone('#2', 'v1', iso(NOW + 6 * DAY_MS), { created_at: iso(NOW - 20 * DAY_MS) }),
    ];

    expect(ganttAxis(issues, 'all', NOW).t1, '現在で切ると、期日の線は必ず軸の外に落ちる').toBe(
      NOW + 6 * DAY_MS,
    );
  });

  it('ずっと先の期日には引きずられない', () => {
    const issues = [
      issue({ id: '#1', created_at: iso(NOW - 10 * DAY_MS) }),
      withMilestone('#2', 'someday', iso(NOW + 300 * DAY_MS), {
        created_at: iso(NOW - 10 * DAY_MS),
      }),
    ];

    expect(
      ganttAxis(issues, 'all', NOW).t1,
      '`1w` が 1 年を描くと、幅の切り替えが何も言わなくなる',
    ).toBe(NOW);
  });

  /* 先に渡すのは過ぎた時間と同じだけ。**軸の半分は実際に在ったものに残る** */
  it('未来に渡す幅は、過ぎた時間と同じだけ', () => {
    const from = iso(NOW - 20 * DAY_MS);
    const near = [withMilestone('#1', 'near', iso(NOW + 19 * DAY_MS), { created_at: from })];
    const far = [withMilestone('#1', 'far', iso(NOW + 21 * DAY_MS), { created_at: from })];

    expect(ganttAxis(near, 'all', NOW).t1).toBe(NOW + 19 * DAY_MS);
    expect(ganttAxis(far, 'all', NOW).t1, '過ぎた時間より先の期日は軸の外へ落とす').toBe(NOW);
  });

  it('幅を広げれば、遠い期日も軸に入る', () => {
    const issues = [
      withMilestone('#1', 'far', iso(NOW + 11 * DAY_MS), { created_at: iso(NOW - 20 * DAY_MS) }),
    ];

    expect(ganttAxis(issues, QUARTER_MS, NOW).t1, '広い幅では過ぎた時間も伸びる').toBe(
      NOW + 11 * DAY_MS,
    );
  });

  it('決まった幅でも期日までは伸びる', () => {
    const issues = [
      withMilestone('#1', 'v1', iso(NOW + 3 * DAY_MS), { created_at: iso(NOW - 2 * DAY_MS) }),
    ];

    expect(ganttAxis(issues, WEEK_MS, NOW)).toEqual({
      t0: NOW - WEEK_MS,
      t1: NOW + 3 * DAY_MS,
    });
  });

  it('過ぎた期日で軸を縮めない', () => {
    const issues = [
      withMilestone('#1', 'shipped', iso(NOW - 3 * DAY_MS), { created_at: iso(NOW - 10 * DAY_MS) }),
    ];

    expect(ganttAxis(issues, 'all', NOW).t1, '過ぎた期日で右端を戻すと、現在が軸の外へ出る').toBe(
      NOW,
    );
  });
});

describe('マイルストーンの縦線', () => {
  const axis = { t0: NOW - MONTH_MS, t1: NOW + MONTH_MS };

  it('軸の中に入る期日を、近い順に返す', () => {
    const issues = [
      withMilestone('#1', 'v2', iso(NOW + 10 * DAY_MS)),
      withMilestone('#2', 'v1', iso(NOW - 2 * DAY_MS)),
    ];

    expect(ganttGuides(issues, axis)).toEqual([
      { title: 'v1', at: NOW - 2 * DAY_MS, where: 'in' },
      { title: 'v2', at: NOW + 10 * DAY_MS, where: 'in' },
    ]);
  });

  it('同じマイルストーンの課題が並んでも、線は 1 本', () => {
    const due = iso(NOW + 3 * DAY_MS);
    const issues = [withMilestone('#1', 'v1', due), withMilestone('#2', 'v1', due)];

    expect(ganttGuides(issues, axis)).toEqual([{ title: 'v1', at: NOW + 3 * DAY_MS, where: 'in' }]);
  });

  it('軸の外の期日は、落とさずに左右どちらへ外れたかを付けて返す', () => {
    const issues = [
      withMilestone('#1', 'old', iso(NOW - 90 * DAY_MS)),
      withMilestone('#2', 'far', iso(NOW + 90 * DAY_MS)),
    ];

    expect(ganttGuides(issues, axis), '線を引けないことと、期日が無いことは違う').toEqual([
      { title: 'old', at: NOW - 90 * DAY_MS, where: 'before' },
      { title: 'far', at: NOW + 90 * DAY_MS, where: 'after' },
    ]);
  });

  it('期日を読めないマイルストーンは、線にはせずに `undated` として残す', () => {
    const issues = [withMilestone('#1', 'someday', null), withMilestone('#2', 'broken', 'soon')];

    expect(
      ganttGuides(issues, axis),
      '読めない日付を 0 として置くと軸の左端に線が立ち、黙って落とすと「期日が無い」と「そんなマイルストーンは無い」が同じ絵になる',
    ).toEqual([
      { title: 'broken', at: null, where: 'undated' },
      { title: 'someday', at: null, where: 'undated' },
    ]);
  });

  it('同じ名前で期日を読めるものが 1 件でも在れば、そちらを採る', () => {
    const due = iso(NOW + 3 * DAY_MS);
    const issues = [withMilestone('#1', 'v1', null), withMilestone('#2', 'v1', due)];

    expect(ganttGuides(issues, axis)).toEqual([{ title: 'v1', at: NOW + 3 * DAY_MS, where: 'in' }]);
  });
});

describe('グリッドの背景', () => {
  const axis = { t0: NOW - MONTH_MS, t1: NOW + MONTH_MS };

  it('軸の中の期日は 1 枚の層になる', () => {
    const image = ganttGridImage([{ title: 'v1', at: NOW + 10 * DAY_MS, where: 'in' }], axis, NOW);

    expect(image.split('linear-gradient').length - 1, '現在の線と期日の線で 2 枚である').toBe(2);
    expect(image).toContain(`${atPct(NOW + 10 * DAY_MS, axis)}%`);
    expect(
      image,
      '色をここへ書き写すと、凡例の見本と 2 か所に散り、片方だけが古い色のまま残る',
    ).toContain('var(--gt-guide)');
    expect(
      image,
      '現在の線と期日の線が同じ色なら、「いま」と「何かの期日」が画面で同じ線になる',
    ).toContain('var(--active)');
  });

  it('左端ちょうどの期日でも層が出る', () => {
    const image = ganttGridImage([{ title: 'v1', at: axis.t0, where: 'in' }], axis, NOW);

    expect(
      image.split('linear-gradient').length - 1,
      '0% の線を切り落とすと、期日どおりに置いた線だけが消える',
    ).toBe(2);
  });

  it('期日を読めないマイルストーンからは層を作らない', () => {
    const image = ganttGridImage([{ title: 'someday', at: null, where: 'undated' }], axis, NOW);

    expect(image.split('linear-gradient').length - 1, '現在の線だけが残る').toBe(1);
  });

  it('軸の外の期日は層を作らない', () => {
    const image = ganttGridImage(
      [{ title: 'far', at: NOW + 90 * DAY_MS, where: 'after' }],
      axis,
      NOW,
    );

    expect(image.split('linear-gradient').length - 1, '現在の線だけが残る').toBe(1);
  });

  it('引く線が 1 本も無ければ `none` を返す', () => {
    expect(ganttGridImage([], { t0: NOW + DAY_MS, t1: NOW + 2 * DAY_MS }, NOW)).toBe('none');
  });
});

describe('目盛り', () => {
  it('8 週までは共有の刻みをそのまま使う', () => {
    const ticks = ganttTicks(NOW - WEEK_MS, NOW);

    expect(ticks.length).toBeGreaterThan(0);
    expect(ticks.length).toBeLessThanOrEqual(8);
  });

  it('3 か月でも本数が増えすぎない', () => {
    const ticks = ganttTicks(NOW - QUARTER_MS, NOW);

    expect(
      ticks.length,
      '共有の刻みは 7 日どまりで、3 か月に当てると 13 本になる',
    ).toBeLessThanOrEqual(8);
    expect(ticks.length).toBeGreaterThan(1);
  });

  it('月をまたぐ軸では、目盛りは月の頭に乗る', () => {
    for (const at of ganttTicks(NOW - 2 * 365 * DAY_MS, NOW)) {
      const date = new Date(at);
      expect(date.getDate()).toBe(1);
      expect(date.getHours()).toBe(0);
    }
  });

  it('目盛りは軸の中だけに置く', () => {
    const t0 = NOW - 400 * DAY_MS;
    for (const at of ganttTicks(t0, NOW)) {
      expect(at).toBeGreaterThanOrEqual(t0);
      expect(at).toBeLessThanOrEqual(NOW);
    }
  });

  it('幅が無ければ目盛りも無い', () => {
    expect(ganttTicks(NOW, NOW)).toEqual([]);
  });
});

describe('目盛りのラベル', () => {
  const at = new Date(2026, 7, 9, 15, 30).getTime();

  it('1 日に収まる幅なら時刻', () => {
    expect(formatGanttTick(at, DAY_MS)).toBe('15:30');
  });

  it('日をまたぐ幅なら日付', () => {
    expect(formatGanttTick(at, QUARTER_MS)).toBe('8/9');
  });

  it('年をまたぐほど広ければ年月', () => {
    expect(formatGanttTick(at, 3 * 365 * DAY_MS), '月の刻みに日付を出しても見分けが付かない').toBe(
      '2026/8',
    );
  });
});
