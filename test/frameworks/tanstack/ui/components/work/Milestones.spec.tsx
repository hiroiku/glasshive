import { render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import {
  Milestones,
  type MilestonesProps,
} from '~/frameworks/tanstack/ui/components/work/Milestones.tsx';
import type { EventLog } from '~/frameworks/tanstack/ui/derive/issueEvents.ts';
import { MONTH_MS } from '~/frameworks/tanstack/ui/derive/issueGantt.ts';
import { absTime } from '~/frameworks/tanstack/ui/format.ts';

/* マイルストーンの表の時間軸。**新しい観測ではない** —— 束に起きたことは、その課題たちに
   起きたことを合わせたものである。

   見るのは 3 つ。課題の一覧と同じ軸の上に置いていること、束ねたことで観測が増えも減りも
   しないこと、そして読めていない課題が束の中に在ることを黙らないこと。 */

vi.mock('~/frameworks/tanstack/ui/components/text/SubjectText.tsx', () => ({
  SubjectText: ({ text }: { text: string }) => <span>{text}</span>,
}));

vi.mock('~/frameworks/tanstack/ui/nav/NavContext.tsx', () => ({
  useNav: () => ({ gotoMilestone: vi.fn(), openRef: vi.fn(), openConv: vi.fn() }),
}));

type Issue = MilestonesProps['issues'][number];

const NOW = Date.parse('2026-08-09T12:00:00Z');
const DAY = 86_400_000;
const iso = (daysAgo: number): string => new Date(NOW - daysAgo * DAY).toISOString();

const issue = (id: string, milestone: string | null, over: Partial<Issue> = {}): Issue =>
  ({
    id,
    title: `title ${id}`,
    status: 'open',
    issue_type: null,
    labels: [],
    assignee: null,
    created_at: iso(20),
    updated_at: iso(1),
    closed_at: null,
    deps: [],
    deps_complete: true,
    github: {
      url: null,
      labels: [],
      assignees: [],
      author: null,
      milestone: milestone === null ? null : { title: milestone, due_on: null },
      issue_type_color: null,
      sub_issues: null,
      pull_requests: [],
      comments: 0,
      reactions: 0,
    },
    ...over,
  }) as Issue;

/** 期日を持つマイルストーンに属する 1 件 */
const dated = (id: string, milestone: string, dueDaysAgo: number, over: Partial<Issue> = {}) => {
  const base = issue(id, milestone, over);
  return {
    ...base,
    github: { ...base.github, milestone: { title: milestone, due_on: iso(dueDaysAgo) } },
  } as Issue;
};

const read = (
  entries: readonly { id: string; at?: number[]; kind?: string; truncated?: boolean }[],
): EventLog => ({
  kind: 'observed',
  complete: true,
  byId: new Map(
    entries.map((entry) => [
      entry.id,
      {
        id: entry.id,
        events: (entry.at ?? []).map((daysAgo) => ({
          at: iso(daysAgo),
          kind: entry.kind ?? 'comment',
        })),
        truncated: entry.truncated ?? false,
      },
    ]),
  ),
});

function draw(issues: readonly Issue[], over: Partial<MilestonesProps> = {}) {
  return render(
    <Milestones
      issues={issues}
      workers={new Map()}
      join={undefined}
      project={undefined}
      lead={null}
      query=""
      ganttWindow={MONTH_MS}
      eventLog={{ kind: 'reading' }}
      nowMs={NOW}
      {...over}
    />,
  );
}

const rowOf = (container: HTMLElement, name: string) => {
  const found = [...container.querySelectorAll('.ms-row:not(.head)')].find(
    (row) => row.querySelector('.ms-name')?.textContent === name,
  );
  if (found === undefined) throw new Error(`${name} の行が無い`);
  return found;
};

const gtOf = (container: HTMLElement, name: string) => {
  const cell = rowOf(container, name).querySelector('.gt');
  if (cell === null) throw new Error(`${name} のトラックが無い`);
  return cell;
};

const pctOf = (node: Element | null, property: 'left' | 'width'): number =>
  Number.parseFloat((node as HTMLElement | null)?.style.getPropertyValue(property) ?? 'NaN');

describe('束に起きたことを 1 本のトラックにする', () => {
  /* 別々の課題に起きたことが、1 本の並びの上でまとまる。**課題ごとにまとめてから重ねると、
     同じ時刻に 2 つの点が並ぶ** —— 束の上では近すぎる点を 1 つにする決まりが効かなくなる。 */
  it('同じ束の課題のイベントを、1 本の並びの上に置く', () => {
    const { container } = draw([issue('#1', 'v2'), issue('#2', 'v2')], {
      eventLog: read([
        { id: '#1', at: [10] },
        { id: '#2', at: [5] },
      ]),
    });
    const cell = gtOf(container, 'v2');

    expect(cell.querySelectorAll('.gt-ev').length).toBe(2);
    expect(cell.getAttribute('title'), '束の件数は、合わせた件数である').toBe(
      `2 events across 2 issues, the last on ${absTime(NOW - 5 * DAY)}`,
    );
  });

  /* 束の中の 1 件だけが記録に居ないことは在る。**線はもう束の全部を語っていない** ——
     黙って束ねると、読めた課題だけの絵が束の絵として出る。 */
  it('記録に居なかった課題が在ることを、行の上で言う', () => {
    const { container } = draw([issue('#1', 'v2'), issue('#2', 'v2'), issue('#3', 'v2')], {
      eventLog: read([{ id: '#1', at: [10] }]),
    });
    const cell = gtOf(container, 'v2');

    expect(cell.querySelector('.gt-off.unplaced')?.textContent).toBe('?2');
    expect(
      cell.getAttribute('title'),
      '読めていない件数を言わないと、線が束の全部を語る',
    ).toContain('2 issues of 3 were not in the event log');
  });

  it('1 件も記録に居なければ、読めなかった束としてハッチを掛ける', () => {
    const { container } = draw([issue('#1', 'v2')], { eventLog: read([{ id: '#9' }]) });
    const cell = gtOf(container, 'v2');

    expect(cell.className, '点の無いトラックは「起きなかった」という別の答えである').toContain(
      'unread',
    );
    expect(cell.getAttribute('title')).toBe(
      'None of the issues here were in the event log that was read',
    );
  });

  /* 課題が閉じた 1 回は、束にとっては起きたことの 1 つである。**フラグへ移さない** ——
     移すと、束の中で片付いた 1 件が、束の上からは何も起きなかったように見える。 */
  it('課題の閉じた 1 回も、点として残す', () => {
    const { container } = draw([issue('#1', 'v2', { status: 'closed', closed_at: iso(6) })], {
      eventLog: read([{ id: '#1', at: [6], kind: 'closed' }]),
    });
    const cell = gtOf(container, 'v2');

    expect(cell.querySelectorAll('.gt-ev').length, '束は閉じないので、移す先のフラグが無い').toBe(
      1,
    );
    expect(cell.querySelector('.gt-flag'), '閉じた時刻のフラグは、課題 1 件のものである').toBe(
      null,
    );
  });

  it('読んでいる最中は、点も輪も出さない', () => {
    const { container } = draw([issue('#1', 'v2')]);
    const cell = gtOf(container, 'v2');

    expect(cell.className).toContain('reading');
    expect(cell.querySelector('.gt-open'), '輪だけが在る絵は「読んで何も無かった」である').toBe(
      null,
    );
    expect(cell.getAttribute('title')).toBe('Reading the issue event log');
  });
});

describe('マイルストーンの表の時間軸', () => {
  /* 期日は GitHub が言う唯一の先の日付である。**閉じた時刻のフラグと同じ形にしない** ——
     あちらは観測した時刻で、こちらは予定である。 */
  it('軸の中の期日を、閉じた時刻とは別の形で置く', () => {
    const { container } = draw([dated('#1', 'v2', 5)], {
      eventLog: read([{ id: '#1', at: [10] }]),
    });
    const cell = gtOf(container, 'v2');
    const due = cell.querySelector('.gt-due');

    expect(pctOf(due, 'left')).toBeCloseTo((25 / 30) * 100, 5);
    expect(due?.getAttribute('title')).toBe(`Due ${absTime(iso(5))}`);
    expect(cell.querySelector('.gt-flag'), '予定を観測した時刻の顔で描かない').toBe(null);
  });

  /* 軸から外れた期日は Due の欄が言葉で言っている。**同じことを 2 つの形で言わない** ——
     端へ寄せると、そこが期日であるようにも読める。 */
  it('軸の外の期日は、トラックには置かない', () => {
    const { container } = draw([dated('#1', 'v2', 90)], {
      eventLog: read([{ id: '#1', at: [10] }]),
    });

    expect(gtOf(container, 'v2').querySelector('.gt-due')).toBe(null);
    expect(
      rowOf(container, 'v2').querySelector('.ms-due')?.textContent,
      'Due の欄が期日そのものを言っている',
    ).not.toBe('');
  });

  /* 軸は課題の一覧と同じ引き方でなければならない。**行き来する 2 つの表である** ——
     同じ幅を選んでいるのに軸が違うと、どちらの絵を信じるか決められない。 */
  it('目盛りは、出ている行の課題で決まる軸の上に置く', () => {
    const { container } = draw([issue('#1', 'v2')], { eventLog: read([{ id: '#1', at: [10] }]) });
    const ticks = [...container.querySelectorAll('#ms-list .gt-head .tick')];

    expect(ticks.length, '目盛りが 1 本も無いと、点がいつのことなのか読めない').toBeGreaterThan(1);
    for (const tick of ticks) {
      const left = pctOf(tick, 'left');
      expect(left).toBeGreaterThanOrEqual(0);
      expect(left).toBeLessThanOrEqual(100);
    }
  });

  /* 束の始まりは、いちばん早く作られた課題である。**後から作られた課題を始まりにしない** ——
     線が短く出て、その区切りが最近始まったことになる。 */
  it('線は、いちばん早く作られた課題から引く', () => {
    const { container } = draw(
      [issue('#1', 'v2', { created_at: iso(25) }), issue('#2', 'v2', { created_at: iso(8) })],
      { eventLog: read([{ id: '#1', at: [4] }, { id: '#2' }]) },
    );
    const line = gtOf(container, 'v2').querySelector('.gt-line');

    expect(line?.getAttribute('title')).toBe(
      `First issue opened ${absTime(iso(25))} — last event ${absTime(iso(4))}`,
    );
    expect(pctOf(line, 'left')).toBeCloseTo((5 / 30) * 100, 5);
  });

  /* 軸の外に落ちたイベントは、課題の一覧と同じように端で数える。**同じ数え方でなければ
     ならない** —— 片方だけが黙ると、行き来した人がどちらを信じるか決められない。 */
  it('軸の外に落ちたイベントを、端で数える', () => {
    const { container } = draw([issue('#1', 'v2', { created_at: iso(90) })], {
      eventLog: read([{ id: '#1', at: [80, 60, 10] }]),
    });
    const off = gtOf(container, 'v2').querySelector('.gt-off.left');

    expect(off?.textContent).toBe('‹2');
    expect(off?.getAttribute('title')).toContain('before this span');
  });
});

/* `all` の軸は出ている行で決まる。**画面から消えた区切りの課題まで数えない** —— 数えると、
   出ていないもののために軸が伸びて、残った行の点が狭いところへ潰れる。課題の一覧と同じ決まりである。 */
describe('絞り込みは、軸そのものを動かす', () => {
  const pair = [
    issue('#1', 'old', { created_at: iso(300) }),
    issue('#2', 'now', { created_at: iso(2) }),
  ];
  const log = read([{ id: '#1' }, { id: '#2' }]);

  it('絞り込みで消えた区切りの課題は、軸を伸ばさない', () => {
    const whole = draw(pair, { ganttWindow: 'all', eventLog: log });
    const filtered = draw(pair, { ganttWindow: 'all', eventLog: log, query: 'now' });

    expect(
      pctOf(gtOf(whole.container, 'now').querySelector('.gt-open'), 'left'),
      '300 日前の課題が軸を決めているので、2 日前の輪は右端の近くに立つ',
    ).toBeGreaterThan(90);
    expect(
      pctOf(gtOf(filtered.container, 'now').querySelector('.gt-open'), 'left'),
      '出ている行だけで決めるなら、この行が軸の左端そのものになる',
    ).toBe(0);
  });
});
