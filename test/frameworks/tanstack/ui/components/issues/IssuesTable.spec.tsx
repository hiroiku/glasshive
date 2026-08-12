import { fireEvent, render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import {
  IssuesTable,
  type IssuesTableProps,
} from '~/frameworks/tanstack/ui/components/issues/IssuesTable.tsx';
import type { EventLog } from '~/frameworks/tanstack/ui/derive/issueEvents.ts';
import {
  DEFAULT_GANTT_WINDOW,
  GANTT_WINDOWS,
  MONTH_MS,
} from '~/frameworks/tanstack/ui/derive/issueGantt.ts';
import { buildWorkJoin } from '~/frameworks/tanstack/ui/derive/workJoin.ts';
import { absTime } from '~/frameworks/tanstack/ui/format.ts';

/* 一覧は「次に何を取るか」を答える表である。

   着手順で並べたときに束の見出しが入ることと、行に触れたときに関わりのある行だけが
   残ることを見る。**どちらも、並び順そのものではなく読み方を決める仕掛けである** ——
   落ちても表は出てしまうので、目で気付けない。 */

/* 題名の中の語を課題や `ref` へ結ぶところは、観測を読みに行く。ここで見たいのは
   束と絞り込みなので、素の文字に差し替える。 */
vi.mock('~/frameworks/tanstack/ui/components/text/SubjectText.tsx', () => ({
  SubjectText: ({ text }: { text: string }) => <span>{text}</span>,
}));

vi.mock('~/frameworks/tanstack/ui/nav/NavContext.tsx', () => ({
  useNav: () => ({
    openConv: vi.fn(),
    openIssue: vi.fn(),
    openRef: vi.fn(),
    gotoBranch: vi.fn(),
    gotoIssues: vi.fn(),
    closePanel: vi.fn(),
  }),
}));

/* 課題の形は、表そのものから引く。写して持つと、形が変わったときに片方だけ古いまま残る */
type Issue = IssuesTableProps['issues'][number];

const NOW = Date.parse('2026-08-09T12:00:00Z');

const issue = (id: string, over: Partial<Issue> = {}): Issue => ({
  id,
  title: `title ${id}`,
  status: 'open',
  issue_type: null,
  labels: [],
  assignee: null,
  created_at: null,
  updated_at: '2026-08-09T11:00:00Z',
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
});

const blocks = (on: string) => ({ on, type: 'blocks' });

function draw(issues: readonly Issue[], over: Partial<IssuesTableProps> = {}) {
  return render(
    <IssuesTable
      issues={issues}
      all={issues}
      project={undefined}
      workers={new Map()}
      query=""
      onQuery={vi.fn()}
      status={null}
      order={{ key: 'updated', direction: 'desc' }}
      onSort={vi.fn()}
      ganttWindow={DEFAULT_GANTT_WINDOW}
      eventLog={{ kind: 'reading' }}
      group={undefined}
      nowMs={NOW}
      firstPaint
      {...over}
    />,
  );
}

const rowsOf = (container: HTMLElement) =>
  [...container.querySelectorAll('.issue-row')].filter(
    (row) => !row.classList.contains('head'),
  ) as HTMLElement[];

const idOf = (row: HTMLElement) => row.querySelector('.iid-t')?.textContent ?? '';

describe('着手順で並べると、束に分かれる', () => {
  const chain = [
    issue('#1'),
    issue('#2', { deps: [blocks('#1')] }),
    issue('#9', { deps: [blocks('#4')] }),
    issue('#4', { deps: [blocks('#9')] }),
  ];

  it('いま取れるもの・待っているもの・輪の中を、見出しで分ける', () => {
    const { container } = draw(chain, { order: { key: 'start', direction: 'asc' } });

    const heads = [...container.querySelectorAll('.iband-t > span')].map(
      (node) => node.textContent,
    );

    expect(heads, '空ける数だけで 1 列に並べると、着手できないものから一覧が始まる').toEqual([
      'Ready now',
      'Waiting',
      'Caught in a cycle',
    ]);
  });

  it('輪の中の課題は、輪の束にだけ入る', () => {
    const { container } = draw(chain, { order: { key: 'start', direction: 'asc' } });
    const bands = [...container.querySelectorAll('.iband, .issue-row')];

    // 最後の見出しより後ろに在る行が、輪の中の課題である
    const at = bands.findLastIndex((node) => node.classList.contains('iband'));
    const caught = bands
      .slice(at + 1)
      .map((node) => node.querySelector('.iid-t')?.textContent ?? '');

    expect(caught.sort()).toEqual(['#4', '#9']);
  });

  it('着手順で並べていないときは、束を作らない', () => {
    const { container } = draw(chain);

    expect(
      container.querySelectorAll('.iband').length,
      '更新順の一覧に着手順の見出しを差し込むと、見出しが並びを表していないことになる',
    ).toBe(0);
  });

  it('これを終わらせると何件が空くかを、着手順のときだけ出す', () => {
    const banded = draw(chain, { order: { key: 'start', direction: 'asc' } });
    expect(banded.container.querySelector('.iunlock')?.textContent).toBe('+1');

    const plain = draw(chain);
    expect(plain.container.querySelector('.iunlock')).toBe(null);
  });
});

describe('行に触れると、関わりのある行だけが残る', () => {
  const web = [
    issue('#1'),
    issue('#2', { deps: [blocks('#1')] }),
    issue('#3', { deps: [blocks('#2')] }),
    issue('#9'),
  ];

  it('依存の向きを問わずに残す', () => {
    const { container } = draw(web);
    const rows = rowsOf(container);
    const middle = rows.find((row) => idOf(row) === '#2');
    if (middle === undefined) throw new Error('#2 の行が無い');

    fireEvent.mouseEnter(middle);

    const lit = rowsOf(container)
      .filter((row) => row.classList.contains('lit'))
      .map(idOf)
      .sort();

    expect(lit, '待っている先も、自分を待っている先も、どちらも関わりである').toEqual([
      '#1',
      '#2',
      '#3',
    ]);
  });

  /* 沈めるかどうかは `#issues-list.hot` が決める。触れていないのに `lit` が付いていると、
     どの行が関わりなのかが CSS からは見えなくなる。 */
  it('誰にも触れていなければ、どの行も残る側にならない', () => {
    const { container } = draw(web);

    expect(container.querySelector('#issues-list')?.classList.contains('hot')).toBe(false);
    expect(
      rowsOf(container).some((row) => row.classList.contains('lit')),
      '触れていないのに残る行が在ると、既定の表が読めない',
    ).toBe(false);
  });

  it('離れたら元に戻る', () => {
    const { container } = draw(web);
    const rows = rowsOf(container);
    const first = rows[0];
    if (first === undefined) throw new Error('行が無い');

    fireEvent.mouseEnter(first);
    fireEvent.mouseLeave(first);

    expect(container.querySelector('#issues-list')?.classList.contains('hot')).toBe(false);
    expect(rowsOf(container).some((row) => row.classList.contains('lit'))).toBe(false);
  });
});

describe('右のトラック', () => {
  const DAY = 86_400_000;
  const iso = (daysAgo: number) => new Date(NOW - daysAgo * DAY).toISOString();

  /** 読めたが、どの課題も並びに居なかった記録。行は `unread` になる */
  const NOT_IN_LOG: EventLog = { kind: 'observed', complete: true, byId: new Map() };

  /* 1 か月の幅で見る。`all` は出ている課題で軸が決まるので、位置を数で確かめられない */
  const drawGantt = (
    issues: readonly Issue[],
    eventLog: EventLog = NOT_IN_LOG,
    over: Partial<IssuesTableProps> = {},
  ) => draw(issues, { ganttWindow: MONTH_MS, eventLog, ...over });

  const read = (
    entries: readonly { id: string; at?: number[]; kind?: string; truncated?: boolean }[],
    complete = true,
  ): EventLog => ({
    kind: 'observed',
    complete,
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

  const rowOf = (container: HTMLElement, id: string) => {
    const row = rowsOf(container).find((candidate) => idOf(candidate) === id);
    if (row === undefined) throw new Error(`${id} の行が無い`);
    return row;
  };

  const gtOf = (container: HTMLElement, id: string) => {
    const cell = rowOf(container, id).querySelector('.gt');
    if (cell === null) throw new Error(`${id} のトラックが無い`);
    return cell;
  };

  const pctOf = (node: Element | null, property: 'left' | 'width'): number =>
    Number.parseFloat((node as HTMLElement | null)?.style.getPropertyValue(property) ?? 'NaN');

  /* 幅を持つ要素は、観測した 2 つの時刻の間にしか出ない。**線の両端は観測した時刻である** ——
     どちらかを推測した時刻へ伸ばすと、それは誰も測っていない長さを主張するバーになる。 */
  it('幅を持つ要素は、観測した時刻から観測した時刻までしか引かない', () => {
    const { container } = drawGantt(
      [issue('#1', { status: 'closed', created_at: iso(15), closed_at: iso(5) })],
      read([{ id: '#1', at: [12, 9] }]),
    );
    const cell = gtOf(container, '#1');
    const widths = [...cell.children].filter((node) => (node as HTMLElement).style.width !== '');
    const line = cell.querySelector('.gt-line');

    expect(
      widths.map((node) => node.className),
      '幅を持ってよいのは線だけである',
    ).toEqual(['gt-line']);
    expect(pctOf(line, 'left'), '線は作られた時刻から始まる').toBeCloseTo((15 / 30) * 100, 5);
    expect(pctOf(line, 'width'), '線は閉じた時刻で止まる。いまの時刻までは引かない').toBeCloseTo(
      (10 / 30) * 100,
      5,
    );
    expect(line?.getAttribute('title')).toBe(
      `Opened ${absTime(NOW - 15 * DAY)} — closed ${absTime(NOW - 5 * DAY)}`,
    );
  });

  /* 開いた課題の線は、最後に観測した時刻で止まる。**いまの時刻までは引かない** ——
     引けば、開いている限り伸び続けるバーが行ごとに並ぶ。 */
  it('開いた課題の線は、最後のイベントで止まる', () => {
    const { container } = drawGantt(
      [issue('#1', { created_at: iso(20) })],
      read([{ id: '#1', at: [12, 8] }]),
    );
    const line = gtOf(container, '#1').querySelector('.gt-line');

    expect(pctOf(line, 'left')).toBeCloseTo((10 / 30) * 100, 5);
    expect(pctOf(line, 'width'), '軸の右端まで引くと、それは観測していない期間である').toBeCloseTo(
      (12 / 30) * 100,
      5,
    );
    expect(line?.getAttribute('title')).toBe(
      `Opened ${absTime(NOW - 20 * DAY)} — last event ${absTime(NOW - 8 * DAY)}`,
    );
  });

  /* 観測した時刻が 1 つしか無い行は、線を持たない。**輪 1 つが完全な答えである** ——
     長さの無い線を引くと、観測していない何かがそこに在ることになる。 */
  it('イベントの無い開いた課題には、線を引かず、輪だけを置く', () => {
    const { container } = drawGantt([issue('#1', { created_at: iso(20) })], read([{ id: '#1' }]));
    const cell = gtOf(container, '#1');

    expect(cell.querySelector('.gt-line'), '観測した時刻が 1 つなら、結ぶ相手が居ない').toBe(null);
    expect(cell.querySelector('.gt-open'), '輪が「観測した時刻は 1 つだった」と言う').not.toBe(
      null,
    );
  });

  /* 作られた時刻が軸の左の外に在る行。線は軸の端で止めるしかないので、**その端をぼかす**
     —— 硬い端で描くと、軸の端で開いた課題として読める。 */
  it('作られた時刻が軸の外なら、左端から引いて、その端をぼかす', () => {
    const { container } = drawGantt(
      [issue('#1', { created_at: iso(90) })],
      read([{ id: '#1', at: [10] }]),
    );
    const line = gtOf(container, '#1').querySelector('.gt-line');

    expect(pctOf(line, 'left'), '軸の左端から引く').toBe(0);
    expect(pctOf(line, 'width')).toBeCloseTo((20 / 30) * 100, 5);
    expect(line?.className, '止めた端を硬く描くと、そこで開いたことになる').toBe(
      'gt-line soft-from',
    );
    expect(line?.getAttribute('title'), '本当に開いた時刻は、言葉の側が持つ').toBe(
      `Opened ${absTime(NOW - 90 * DAY)} — last event ${absTime(NOW - 10 * DAY)}. The line stops at the edge of this span: it starts before this span — widen the span to see all of it.`,
    );
  });

  /* 閉じた時刻が `updated_at` の代用なら、線の終わりも観測した時刻ではない。
   **フラグを破線にしておいて線を硬く描くと、線のほうが代用を事実にしてしまう。** */
  it('代用の時刻で閉じた課題は、線の終わりの端もぼかす', () => {
    const { container } = drawGantt(
      [issue('#1', { status: 'closed', created_at: iso(20), updated_at: iso(6), closed_at: null })],
      read([{ id: '#1' }]),
    );
    const cell = gtOf(container, '#1');

    expect(cell.querySelector('.gt-line')?.className).toBe('gt-line soft-to');
    expect(cell.querySelector('.gt-flag')?.className, '同じ 1 つの端が、2 つの絵で食い違う').toBe(
      'gt-flag approx',
    );
    expect(cell.querySelector('.gt-line')?.getAttribute('title')).toBe(
      `Opened ${absTime(NOW - 20 * DAY)} — closed around ${absTime(NOW - 6 * DAY)}, taken from updated_at`,
    );
  });

  /* 開いた時刻を読めず、イベントも 1 件も無い行。置ける時刻が 1 つも無いので、線も輪も
     出ない。**そこで黙ると、読んで何も起きていなかった行と同じ空のトラックになる。** */
  it('開いた時刻を読めずイベントも無い行は、軸に置けないことを端で言う', () => {
    const { container } = drawGantt(
      [issue('#1', { created_at: 'yesterday' }), issue('#2', { created_at: iso(20) })],
      read([{ id: '#1' }, { id: '#2' }]),
    );
    const unplaced = gtOf(container, '#1').querySelector('.gt-off.unplaced');

    expect(unplaced?.textContent, '空のトラックは「読んで、何も起きていなかった」と読まれる').toBe(
      '?',
    );
    expect(unplaced?.getAttribute('title')).toBe(
      'When this issue was opened could not be read, and no events are on record — nothing can be placed on this axis for it',
    );
    expect(
      gtOf(container, '#2').querySelector('.gt-off.unplaced'),
      '開いた時刻を読めている行にまで出すと、目印そのものが意味を失う',
    ).toBe(null);
  });

  it('`created_at` を読めない課題には、作られた時刻の輪を置かない', () => {
    const { container } = drawGantt(
      [issue('#1', { created_at: 'yesterday' })],
      read([{ id: '#1', at: [10] }]),
    );
    const cell = gtOf(container, '#1');

    expect(cell.querySelector('.gt-open'), '読めない時刻を軸の左端に置くと、観測に化ける').toBe(
      null,
    );
    expect(
      cell.querySelector('.gt-line'),
      '置けた時刻は 1 つだけである。結ぶ相手の無い線を引かない',
    ).toBe(null);
    expect(cell.querySelectorAll('.gt-ev').length, '読めたイベントは点として残る').toBe(1);
  });

  /* 開いた時刻を語るのは、イベントが 1 件も無かった行の文だけである。1 件でも読めた行は
     件数と最後の時刻を言うので、そこを見ていても分岐を通らない。 */
  it('開いた時刻を読めていないなら、そこを始まりとして語らない', () => {
    const { container } = drawGantt(
      [issue('#1', { created_at: 'yesterday' }), issue('#2', { created_at: iso(20) })],
      read([{ id: '#1' }, { id: '#2' }]),
    );

    expect(
      gtOf(container, '#1').getAttribute('title'),
      '読めていない時刻を「開いてから」の始まりにすると、観測に化ける',
    ).toBe('No events on record for this issue');
    expect(
      gtOf(container, '#2').getAttribute('title'),
      '読めているなら、いつからの話なのかを言う',
    ).toBe('No events on record since it was opened');
  });

  it('読み残しも軸の外に在るなら、端の件数がそれも言う', () => {
    const { container } = drawGantt(
      [issue('#1', { created_at: iso(90) }), issue('#2', { created_at: iso(90) })],
      read([
        { id: '#1', at: [80, 5], truncated: true },
        { id: '#2', at: [80, 5] },
      ]),
    );
    const cut = gtOf(container, '#1').querySelector('.gt-off.left');
    const plain = gtOf(container, '#2').querySelector('.gt-off.left');

    expect(
      cut?.className,
      '「外にもっと在る」と「読み切れていない」を同じ色で言うと、後者が消える',
    ).toContain('cut');
    expect(cut?.getAttribute('title')).toContain('also cut short');
    expect(plain?.className, '切れていない行まで読み残しの色にしない').not.toContain('cut');
    expect(plain?.getAttribute('title')).not.toContain('also cut short');
  });

  it('区間の端が観測した時刻かどうかを、class が持つ', () => {
    /* `#3` は記録の始まりが軸の左の外に在る行である。`closed` はフラグへ移して並びから
       外れるので端の件数も出ず、区間の右端だけが読み残しの在りかを言う。

       一覧の `closed_at` と記録の `closed` が同じ 1 回を 1 秒ずれて書くのは、GitHub の返す
       時刻でそのまま起きる。ここでは軸の左端がその 1 秒の間に落ちていて、`closed_at`
       (30 日前ちょうど)は軸の中、記録の `closed`(その 1 秒前)は軸の外に在る。 */
    const SECOND_IN_DAYS = 1 / 86_400;
    const { container } = drawGantt(
      [
        issue('#1', { created_at: iso(20) }),
        issue('#2', { created_at: 'yesterday' }),
        issue('#3', { status: 'closed', created_at: iso(60), closed_at: iso(30) }),
      ],
      read([
        { id: '#1', at: [8], truncated: true },
        { id: '#2', at: [8], truncated: true },
        { id: '#3', at: [30 + SECOND_IN_DAYS], kind: 'closed', truncated: true },
      ]),
    );

    expect(gtOf(container, '#1').querySelector('.gt-cut')?.className).toBe('gt-cut');
    expect(
      gtOf(container, '#2').querySelector('.gt-cut')?.className,
      'ぼかした端と硬い端が同じ class なら、画面でも同じ絵になる',
    ).toBe('gt-cut soft-from');
    expect(
      gtOf(container, '#3').querySelector('.gt-cut')?.className,
      '軸の端で止めた右端を硬く描くと、記録がそこから在ることになる',
    ).toBe('gt-cut soft-from soft-to');
  });

  it('軸の先へ落ちたイベントも、端で数える', () => {
    const { container } = drawGantt(
      [issue('#1', { created_at: iso(20) })],
      read([{ id: '#1', at: [-5, 10] }]),
    );
    const off = gtOf(container, '#1').querySelector('.gt-off.right');

    expect(off?.textContent, '数えないと、軸の先のイベントが起きていないことになる').toBe('1›');
    expect(off?.getAttribute('title')).toContain('beyond this span');
  });

  /* 読み残しが在るのは古いほうだけである。`timelineItems(last: 30)` が落とすのはそこなので、
   **軸の先で数えたイベントに読み残しを添えると、読めているものを読めていないと言う。** */
  it('軸の先で数えたイベントには、読み残しの在りかを添えない', () => {
    const { container } = drawGantt(
      [issue('#1', { created_at: iso(20) })],
      read([{ id: '#1', at: [-5, 10], truncated: true }]),
    );

    expect(
      gtOf(container, '#1').querySelector('.gt-off.right')?.getAttribute('title'),
      '落ちているのは古いほうなので、先の側にはもう読めないものは無い',
    ).not.toContain('also cut short');
  });

  /* 軸の外で作られた課題。**輪は置き、置いた位置が時刻ではないことを見た目で言う** ——
     落とすと、幅を狭めただけで、この幅より後に作られた課題と同じ絵になる。 */
  it('軸の外で作られた課題は、輪を端に寄せて置き、寄せたことを言う', () => {
    const { container } = drawGantt(
      [issue('#1', { created_at: iso(90) })],
      read([{ id: '#1', at: [10] }]),
    );
    const open = gtOf(container, '#1').querySelector('.gt-open');

    expect(pctOf(open, 'left'), '軸の左端に寄せて置く').toBe(0);
    expect(
      open?.className.split(' '),
      '硬い輪のままだと、幅を切り替えただけで開いた時刻が動いたことになる',
    ).toContain('soft-from');
    expect(open?.getAttribute('title'), '指す時刻はいつも本当の時刻である').toBe(
      `Opened ${absTime(NOW - 90 * DAY)}, before this span starts — the ring sits at the edge, not at that time. Widen the span to place it.`,
    );
  });

  /* 軸の外のイベントを数える `‹N` は、起きたことだけを数えている。**始まりは数に入らない**
     —— 開いた時刻も軸の外に在って輪が端に立つので、数え方を間違えると `‹3` になる。 */
  it('軸の外に落ちたイベントは、端で数える。端に寄せた輪はそこに入らない', () => {
    const { container } = drawGantt(
      [issue('#1', { created_at: iso(90) })],
      read([{ id: '#1', at: [80, 60, 10] }]),
    );
    const cell = gtOf(container, '#1');
    const off = cell.querySelector('.gt-off');

    expect(cell.querySelector('.gt-open.soft-from'), '端の輪も出ている行で数える').not.toBe(null);
    expect(off?.textContent, '黙って落とすと、何度も動いた課題と何も無い課題が同じ絵になる').toBe(
      '‹2',
    );
    expect(off?.getAttribute('title')).toContain('widen the span');
  });

  /* 区間の説明は、左端が観測した時刻のときだけ「いつから」を言う。ぼかした端の時刻を
     そのまま範囲の端として言うと、読み残しの始まりを観測したことになる。 */
  it('区間の説明は、始まりを観測できているときだけ両端の時刻を言う', () => {
    const { container } = drawGantt(
      [
        issue('#1', { created_at: iso(20) }),
        issue('#2', { created_at: 'yesterday' }),
        issue('#3', { created_at: iso(90) }),
      ],
      read([
        { id: '#1', at: [8], truncated: true },
        { id: '#2', at: [8], truncated: true },
        { id: '#3', at: [8], truncated: true },
      ]),
    );
    const said = (id: string) =>
      gtOf(container, id).querySelector('.gt-cut')?.getAttribute('title') ?? '';

    expect(said('#1'), '両端とも観測した時刻なので、どこからどこまでかを言える').toContain(
      'between',
    );
    expect(said('#2'), '読めない時刻を範囲の端として言うと、観測に化ける').not.toContain('between');
    expect(
      said('#3'),
      '軸の外まで続く区間の左端は、読めた時刻であっても区間の始まりではない',
    ).not.toContain('between');
  });

  /* 移ってきた課題は、自分の `created_at` より古いイベントを連れて来る。区間の左端を
     そのまま置くと、右端 —— 記録の始まり —— を追い越す。 */
  it('`created_at` が手元のいちばん古いイベントより後でも、区間は逆向きにならない', () => {
    const { container } = drawGantt(
      [issue('#1', { created_at: iso(20) })],
      read([{ id: '#1', at: [25], truncated: true }]),
    );
    const cut = gtOf(container, '#1').querySelector('.gt-cut');

    expect(pctOf(cut, 'left'), '左端は切れ目まで下げる').toBeCloseTo((5 / 30) * 100, 5);
    expect(pctOf(cut, 'width'), '負の幅を渡すと、区間ごとブラウザーに捨てられる').toBe(0);
    expect(cut?.className, '追い越した左端は、区間の始まりを観測した時刻ではない').toBe(
      'gt-cut soft-from',
    );
  });

  it('イベント 1 つが軸の上の位置に 1 つの点になる', () => {
    const { container } = drawGantt(
      [issue('#1', { created_at: iso(20) })],
      read([{ id: '#1', at: [15] }]),
    );
    const marks = gtOf(container, '#1').querySelectorAll('.gt-ev');

    expect(marks.length).toBe(1);
    expect(pctOf(marks[0] ?? null, 'left'), '15 日前は 30 日の軸のちょうど半ばである').toBeCloseTo(
      50,
      5,
    );
  });

  it('作られた時刻は輪で、閉じた時刻はフラグで置く', () => {
    const { container } = drawGantt(
      [
        issue('#1', {
          status: 'closed',
          created_at: iso(20),
          updated_at: iso(4),
          closed_at: iso(6),
        }),
      ],
      read([{ id: '#1', at: [10] }]),
    );
    const cell = gtOf(container, '#1');

    expect(pctOf(cell.querySelector('.gt-open'), 'left')).toBeCloseTo((10 / 30) * 100, 5);
    expect(pctOf(cell.querySelector('.gt-flag'), 'left')).toBeCloseTo((24 / 30) * 100, 5);
    expect(
      cell.querySelector('.gt-flag')?.className,
      '`closed_at` を読めているので、時刻は代用ではない',
    ).not.toContain('approx');
  });

  it('`closed_at` を読めずに `updated_at` へ落ちたフラグは、代用だと言う', () => {
    const { container } = drawGantt(
      [issue('#1', { status: 'closed', created_at: iso(20), updated_at: iso(6), closed_at: null })],
      read([{ id: '#1' }]),
    );
    const flag = gtOf(container, '#1').querySelector('.gt-flag');

    expect(flag?.className).toContain('approx');
    expect(flag?.getAttribute('title'), '画面の側で言い落とすと、代用が観測に化ける').toContain(
      'updated_at',
    );
  });

  it('フラグの色は、行のチップと同じところから採る', () => {
    const { container } = drawGantt(
      [issue('#1', { status: 'blocked', created_at: iso(4) })],
      read([{ id: '#1' }]),
    );

    expect(
      gtOf(container, '#1').className,
      'トラックだけ別の色にすると、行の中で状態が 2 つの意味を持つ',
    ).toContain('st-blocked');
  });

  it('近すぎる 2 つは 1 つの点になり、そのことが class に出る', () => {
    const { container } = drawGantt(
      [issue('#1', { created_at: iso(29) })],
      read([{ id: '#1', at: [15, 14.9] }]),
    );
    const marks = gtOf(container, '#1').querySelectorAll('.gt-ev');

    expect(marks.length).toBe(1);
    expect(marks[0]?.className).toContain('many');
    expect(marks[0]?.getAttribute('title'), '件数は形ではなく言葉が言う').toContain('2 events');
  });

  it('堰き止めていた相手が先に片付いていれば、待ちの線を引く', () => {
    const { container } = drawGantt([
      issue('#1', { status: 'closed', created_at: iso(20), closed_at: iso(16) }),
      issue('#2', { created_at: iso(10), deps: [blocks('#1')] }),
    ]);
    const lag = gtOf(container, '#2').querySelector('.gt-lag');

    expect(pctOf(lag, 'left'), '16 日前は 30 日の軸の 14 日目である').toBeCloseTo(
      (14 / 30) * 100,
      5,
    );
    expect(pctOf(lag, 'width'), '待った 6 日ぶんの幅である').toBeCloseTo((6 / 30) * 100, 5);
    expect(
      lag?.getAttribute('title'),
      '長さを言うのはこの文だけである。線は軸に収めて引くので、幅からは読めない',
    ).toBe('Waiting on #1 — 6d from #1 ending to this issue being created');
    expect(gtOf(container, '#1').querySelector('.gt-lag'), '待つ相手が無い行には引かない').toBe(
      null,
    );
  });

  /* 日より細かくは言わないので、端数は丸める。切り捨てると、待った長さがいつも短い側へ寄る。 */
  it('待った長さは、日で丸めて言う', () => {
    const { container } = drawGantt([
      issue('#1', { status: 'closed', created_at: iso(28), closed_at: iso(16) }),
      issue('#2', { created_at: iso(9.4), deps: [blocks('#1')] }),
    ]);

    expect(
      gtOf(container, '#2').querySelector('.gt-lag')?.getAttribute('title'),
      '6.6 日を 6 日と言うと、待った長さが短い側へ寄る',
    ).toBe('Waiting on #1 — 7d from #1 ending to this issue being created');
  });

  /* 待ちの始まりは相手が閉じた時刻そのものであり、**その時刻を決めるのは相手の行である**
     —— 記録に読めた `closed` が在れば、相手の行はそちらへフラグを移して代用をやめる。
     待ちの側で一覧から測り直すと、同じ 1 つの時刻が行によって別のところに、別の意味で並ぶ。 */
  it('相手の行のフラグと待ちの始まりは、同じ 1 つの時刻を指す', () => {
    const dependent = issue('#2', { created_at: iso(10), deps: [blocks('#1')] });
    const blocker = issue('#1', {
      status: 'closed',
      created_at: iso(28),
      updated_at: iso(16),
      closed_at: null,
    });
    const substitute = drawGantt([blocker, dependent]);
    const inLog = drawGantt([blocker, dependent], read([{ id: '#1', at: [25], kind: 'closed' }]));
    const observed = drawGantt([
      issue('#1', {
        status: 'closed',
        created_at: iso(28),
        updated_at: iso(16),
        closed_at: iso(16),
      }),
      dependent,
    ]);
    const flagOf = (container: HTMLElement) => gtOf(container, '#1').querySelector('.gt-flag');
    const lagOf = (container: HTMLElement) => gtOf(container, '#2').querySelector('.gt-lag');

    expect(flagOf(substitute.container)?.className).toBe('gt-flag approx');
    expect(
      lagOf(substitute.container)?.className,
      '相手がぼかして描いた時刻から、硬い長さを測らない',
    ).toBe('gt-lag approx');
    expect(pctOf(lagOf(substitute.container), 'left')).toBeCloseTo(
      pctOf(flagOf(substitute.container), 'left'),
      5,
    );
    expect(lagOf(substitute.container)?.getAttribute('title')).toBe(
      'Waiting on #1 — about 6d, measured from a close time taken from updated_at, so where this wait starts is approximate',
    );

    expect(
      flagOf(inLog.container)?.className,
      '記録に `closed` を読めているなら、相手の行は代用をやめて硬いフラグを立てる',
    ).toBe('gt-flag');
    expect(pctOf(flagOf(inLog.container), 'left')).toBeCloseTo((5 / 30) * 100, 5);
    expect(
      pctOf(lagOf(inLog.container), 'left'),
      '1 つの時刻を、行によって別のところに描かない',
    ).toBeCloseTo((5 / 30) * 100, 5);
    expect(
      lagOf(inLog.container)?.className,
      '相手の行が読めたと言う時刻から測った長さを、代用の顔で描かない',
    ).toBe('gt-lag');
    expect(lagOf(inLog.container)?.getAttribute('title')).toBe(
      'Waiting on #1 — 15d from #1 ending to this issue being created',
    );

    const filtered = drawGantt(
      [blocker, dependent],
      read([{ id: '#1', at: [25], kind: 'closed' }]),
      {
        query: '#2',
      },
    );
    expect(rowsOf(filtered.container).length, '絞り込みで残るのは `#2` だけである').toBe(1);
    expect(
      pctOf(lagOf(filtered.container), 'left'),
      '相手が画面に出ているかどうかで、相手の閉じた時刻が変わってはいけない',
    ).toBeCloseTo((5 / 30) * 100, 5);
    expect(lagOf(filtered.container)?.className).toBe('gt-lag');

    expect(
      lagOf(observed.container)?.className,
      '観測できている時刻から測った長さまでぼかさない',
    ).toBe('gt-lag');
  });

  it('まだ閉じていない相手を待つ行には、待ちの線を引かない', () => {
    const { container } = drawGantt([
      issue('#1', { created_at: iso(20) }),
      issue('#2', { created_at: iso(10), deps: [blocks('#1')] }),
    ]);

    expect(
      gtOf(container, '#2').querySelector('.gt-lag'),
      'まだ塞いでいる相手を、もう空いたことにしない',
    ).toBe(null);
  });

  it('待ちを決めるのは、いちばん後に終わる相手である', () => {
    const { container } = drawGantt([
      issue('#1', { status: 'closed', created_at: iso(25), updated_at: iso(22) }),
      issue('#2', { created_at: iso(20) }),
      issue('#3', { created_at: iso(10), deps: [blocks('#1'), blocks('#2')] }),
    ]);

    expect(
      gtOf(container, '#3').querySelector('.gt-lag'),
      'まだ塞いでいる相手が居るのに、先に片付いた相手から待ちを引くと、空いていた期間が伸びる',
    ).toBe(null);
  });

  /* 相手が画面に出ているかどうかは、その相手がいつ片付いたかとは関係が無い。出ている行
     だけで待ちの相手を決めると、絞り込みで消えた相手が抜け、1 つ前に片付いた相手から
     測ることになる —— 検索語を 1 文字打つだけで、同じ課題の待ちが伸びる。 */
  it('絞り込みで画面から消えた相手も、待ちの相手として数える', () => {
    const trio = [
      issue('#1', { status: 'closed', created_at: iso(28), closed_at: iso(25) }),
      issue('#2', { status: 'closed', created_at: iso(28), closed_at: iso(16) }),
      issue('#3', { created_at: iso(10), deps: [blocks('#1'), blocks('#2')] }),
    ];
    const whole = drawGantt(trio);
    const filtered = drawGantt(trio, NOT_IN_LOG, { query: '#3' });
    const lagOf = (container: HTMLElement) => gtOf(container, '#3').querySelector('.gt-lag');

    expect(rowsOf(filtered.container).length, '絞り込みで残るのは `#3` だけである').toBe(1);
    expect(pctOf(lagOf(whole.container), 'left')).toBeCloseTo((14 / 30) * 100, 5);
    expect(
      pctOf(lagOf(filtered.container), 'left'),
      '消えた相手を塞いでいなかったことにすると、まだ塞がれていた期間まで空いていたと描く',
    ).toBeCloseTo((14 / 30) * 100, 5);
    expect(lagOf(filtered.container)?.getAttribute('title')).toContain('#2');
  });

  it('手元に無い相手を待つ行には、待ちの線を引かない', () => {
    const { container } = drawGantt([
      issue('#1', { status: 'closed', created_at: iso(28), closed_at: iso(16) }),
      issue('#2', { created_at: iso(10), deps: [blocks('#1'), blocks('#404')] }),
    ]);

    expect(
      gtOf(container, '#2').querySelector('.gt-lag'),
      'いつ解けたのかを観測できていない相手を、塞いでいなかったことにしない',
    ).toBe(null);
  });

  /* 閉じた時刻は、表に渡された課題ではなく全件から組む。**既定の一覧は閉じた課題を落とすので、
     堰き止めていた相手はたいてい表に渡ってこない** —— 渡された課題だけで組むと、既定の画面で
     待ちの線が 1 本も出ない。 */
  it('一覧から外れた相手の閉じた時刻も、全件から引く', () => {
    const blocker = issue('#1', { status: 'closed', created_at: iso(28), closed_at: iso(16) });
    const dependent = issue('#2', { created_at: iso(10), deps: [blocks('#1')] });
    const { container } = drawGantt([dependent], NOT_IN_LOG, { all: [blocker, dependent] });

    expect(rowsOf(container).length, '出ているのは待っていた行だけである').toBe(1);
    expect(
      pctOf(gtOf(container, '#2').querySelector('.gt-lag'), 'left'),
      '16 日前は 30 日の軸の 14 日目である',
    ).toBeCloseTo((14 / 30) * 100, 5);
  });

  /* 自分を指す依存は、自分がまだ閉じていないかぎり「いつ解けたか分からない相手」になる。
   **それで待ちを黙らせると、本当に堰き止めていた相手の線まで消える。** */
  it('自分を指す依存は、待ちの相手として数えない', () => {
    const { container } = drawGantt([
      issue('#1', { status: 'closed', created_at: iso(28), closed_at: iso(16) }),
      issue('#2', { created_at: iso(10), deps: [blocks('#1'), blocks('#2')] }),
    ]);

    expect(
      gtOf(container, '#2').querySelector('.gt-lag')?.getAttribute('title'),
      '自分が閉じるのを自分で待っていたことにしない',
    ).toBe('Waiting on #1 — 6d from #1 ending to this issue being created');
  });

  it('相手が閉じたのがこの課題より後なら、待ちの線を引かない', () => {
    const { container } = drawGantt([
      issue('#1', { status: 'closed', created_at: iso(28), closed_at: iso(6) }),
      issue('#2', { created_at: iso(10), deps: [blocks('#1')] }),
    ]);

    expect(
      gtOf(container, '#2').querySelector('.gt-lag'),
      '逆向きの線は、待っていない期間を待ったと描く',
    ).toBe(null);
  });

  /* 待ちは軸と重なるところにしか引けない。**丸ごと軸の外に在る待ちを端で止めると、置ける
     ものは幅の無い線だけになる** —— 待った長さがそこに残らないのに、線だけが端に立つ。
     左右のどちらへ外れても同じで、右へ外れるのは `nowMs` が決まった間隔でしか進まないためである。 */
  it('軸の先で解けた堰き止めからは、待ちの線を引かない', () => {
    const { container } = drawGantt([
      issue('#1', { status: 'closed', created_at: iso(20), closed_at: iso(-1) }),
      issue('#2', { created_at: iso(-2), deps: [blocks('#1')] }),
    ]);

    expect(
      gtOf(container, '#2').querySelector('.gt-lag'),
      '軸の右端で止めて引くと、まだ塞がれていた時間を待ちの終わりとして描く',
    ).toBe(null);
  });

  it('軸より前に作られた課題には、待ちの線を引かない', () => {
    const { container } = drawGantt([
      issue('#1', { status: 'closed', created_at: iso(60), closed_at: iso(50) }),
      issue('#2', { created_at: iso(40), deps: [blocks('#1')] }),
    ]);

    expect(
      gtOf(container, '#2').querySelector('.gt-lag'),
      '両端とも軸の左の外なら、置けるのは幅の無い線だけである',
    ).toBe(null);
  });

  it('軸の外で片付いた相手から測る待ちは、始まりの端をぼかす', () => {
    const dependent = issue('#2', { created_at: iso(10), deps: [blocks('#1')] });
    const outside = drawGantt([
      issue('#1', { status: 'closed', created_at: iso(60), closed_at: iso(40) }),
      dependent,
    ]);
    const onEdge = drawGantt([
      issue('#1', { status: 'closed', created_at: iso(60), closed_at: iso(30) }),
      dependent,
    ]);
    const lag = gtOf(outside.container, '#2').querySelector('.gt-lag');

    expect(pctOf(lag, 'left'), '軸の左端で止めて引く').toBe(0);
    expect(
      lag?.className,
      '止めた端を硬く描くと、誰も観測していない時刻から待ちが始まったことになる',
    ).toBe('gt-lag soft-from');
    expect(
      lag?.getAttribute('title'),
      '線は 20 日ぶんしか無いので、測った 30 日と止めたことを文が言わないと、長さが 20 日に読める',
    ).toBe(
      'Waiting on #1 — 30d from #1 ending to this issue being created. The line stops at the edge of this span: #1 ended before this span — widen the span to see the whole wait.',
    );
    expect(
      gtOf(onEdge.container, '#2').querySelector('.gt-lag')?.className,
      '軸の端ちょうどは観測した時刻なので、ぼかさない',
    ).toBe('gt-lag');

    /* 端の 1 ミリ秒外まで硬く引くと、止めた端が観測した時刻の顔で描かれる。端ちょうどと
       見分けが付かないので、境目がどちらへ動いても絵からは気付けない。 */
    const justOutside = drawGantt([
      issue('#1', {
        status: 'closed',
        created_at: iso(60),
        closed_at: new Date(NOW - MONTH_MS - 1).toISOString(),
      }),
      dependent,
    ]);

    expect(
      gtOf(justOutside.container, '#2').querySelector('.gt-lag')?.className,
      '1 ミリ秒でも外なら、軸の端で止めて引いている',
    ).toBe('gt-lag soft-from');
  });

  /* 代用の時刻から測った待ちが、軸の外から始まることも在る。**ぼかす理由は 2 つ別々である**
     —— 代用は時刻そのものが観測でないことを言い、軸で止めた端はそこが端でないことを言う。 */
  it('代用の時刻から測る待ちが軸の外で始まるなら、ぼかす理由を 2 つとも言う', () => {
    const { container } = drawGantt([
      issue('#1', { status: 'closed', created_at: iso(60), updated_at: iso(40), closed_at: null }),
      issue('#2', { created_at: iso(10), deps: [blocks('#1')] }),
    ]);
    const lag = gtOf(container, '#2').querySelector('.gt-lag');

    expect(lag?.className, '軸で止めた端だけを言うと、代用の時刻が観測した時刻に読める').toBe(
      'gt-lag approx soft-from',
    );
    expect(lag?.getAttribute('title')).toBe(
      'Waiting on #1 — about 30d, measured from a close time taken from updated_at, so where this wait starts is approximate. The line stops at the edge of this span: #1 ended before this span — widen the span to see the whole wait.',
    );
  });

  /* 両端とも軸の外に在る待ちは、軸をまたいで引かれる。**片方だけぼかすと、残った端が
     観測した時刻の顔で描かれる** —— 線は端から端まで在るので、絵では区別が付かない。 */
  it('両端とも軸の外に在る待ちは、両方の端をぼかして、両方を言う', () => {
    const { container } = drawGantt([
      issue('#1', { status: 'closed', created_at: iso(60), closed_at: iso(50) }),
      issue('#2', { created_at: iso(-2), deps: [blocks('#1')] }),
    ]);
    const lag = gtOf(container, '#2').querySelector('.gt-lag');

    expect(pctOf(lag, 'left'), '軸の左端で止めて引く').toBe(0);
    expect(pctOf(lag, 'width'), '軸の右端まで引く').toBe(100);
    expect(lag?.className).toBe('gt-lag soft-from soft-to');
    expect(lag?.getAttribute('title'), '止めた端が 2 つ在るなら、2 つとも言う').toBe(
      'Waiting on #1 — 52d from #1 ending to this issue being created. The line stops at the edge of this span: #1 ended before this span and this issue was created after this span — widen the span to see the whole wait.',
    );
  });

  it('軸の先で作られた課題の待ちは、終わりの端をぼかす', () => {
    const { container } = drawGantt([
      issue('#1', { status: 'closed', created_at: iso(20), closed_at: iso(10) }),
      issue('#2', { created_at: iso(-2), deps: [blocks('#1')] }),
    ]);
    const lag = gtOf(container, '#2').querySelector('.gt-lag');

    expect(pctOf(lag, 'left')).toBeCloseTo((20 / 30) * 100, 5);
    expect(pctOf(lag, 'width'), '軸の右端で止めて引く').toBeCloseTo((10 / 30) * 100, 5);
    expect(lag?.className, '作られた時刻は軸の外なので、線は端で硬く終わることになる').toBe(
      'gt-lag soft-to',
    );
    expect(lag?.getAttribute('title')).toBe(
      'Waiting on #1 — 12d from #1 ending to this issue being created. The line stops at the edge of this span: this issue was created after this span — widen the span to see the whole wait.',
    );
    const open = gtOf(container, '#2').querySelector('.gt-open');

    expect(pctOf(open, 'left'), '軸の先で作られた課題の輪は、右端に寄せて置く').toBe(100);
    expect(open?.className.split(' '), '寄せた輪を硬い輪と同じ顔にしない').toContain('soft-to');
    /* **置けないものに、幅を広げてみるようには言わない。** 軸の右端は現在より手前には
       来ないので、軸の先に作られた課題はどの幅を選んでも置けない。 */
    expect(open?.getAttribute('title'), '広げれば見えると言うと、幅を全部試させることになる').toBe(
      `Opened ${absTime(NOW + 2 * DAY)}, after this span ends — the ring sits at the edge, not at that time.`,
    );
  });

  /* 依存には堰き止め以外の種類も在る。堰き止めでない依存から線を引くと、データが言って
     いない待ちを、両端とも観測した時刻の顔で描くことになる。 */
  it('堰き止めない依存からは、待ちの線を引かない', () => {
    const { container } = drawGantt([
      issue('#1', { status: 'closed', created_at: iso(28), closed_at: iso(16) }),
      issue('#2', { created_at: iso(10), deps: [{ on: '#1', type: 'parent' }] }),
    ]);

    expect(
      gtOf(container, '#2').querySelector('.gt-lag'),
      '親子の依存は、相手が片付くまで手を付けられないという話ではない',
    ).toBe(null);
  });

  it('読んでいる最中は、待ちの線も引かない', () => {
    const pair = [
      issue('#1', { status: 'closed', created_at: iso(20), updated_at: iso(16) }),
      issue('#2', { created_at: iso(10), deps: [blocks('#1')] }),
    ];
    const reading = drawGantt(pair, { kind: 'reading' });
    const observed = drawGantt(pair, read([{ id: '#1' }, { id: '#2' }]));

    expect(
      gtOf(reading.container, '#2').querySelector('.gt-lag'),
      'まだ読んでいない行が、待った長さを主張することになる',
    ).toBe(null);
    expect(
      gtOf(observed.container, '#2').querySelector('.gt-lag'),
      '待ちの両端は一覧から出る観測なので、読み終えた行には残る',
    ).not.toBe(null);
  });

  /* **軸は、観測したと言うことを変えない。**

     幅を選ぶのも絞り込むのも見る人であり、相手がいつ閉じたかは記録の側の事実である。幅で
     変わってよいのは「ここに描けるか」だけで、長さと代用かどうかは変わってはいけない ——
     変わるなら、キーボードを 1 打しただけで、観測したことが観測できなかったことになる。 */
  describe('軸を変えても、観測したと言うことは変わらない', () => {
    /* `#1` は `closed_at` を読めず `updated_at` が 2 日前だが、記録には 10 日前の `closed` が
       在る。閉じた時刻は 10 日前で、代用ではない。`#0` は `all` の軸の左端を決めるために置く。 */
    const trio = [
      issue('#0', { created_at: iso(200) }),
      issue('#1', { status: 'closed', created_at: iso(28), updated_at: iso(2), closed_at: null }),
      issue('#2', { created_at: iso(1), deps: [blocks('#1')] }),
    ];
    const log = read([{ id: '#1', at: [10], kind: 'closed' }]);

    const claimOf = (node: Element | null) => ({
      days: /— (?:about )?(\d+)d/.exec(node?.getAttribute('title') ?? '')?.[1] ?? null,
      approx: (node?.className ?? '').split(' ').includes('approx'),
      said: (node?.getAttribute('title') ?? '').includes('approximate'),
    });

    const at = (window: IssuesTableProps['ganttWindow']) =>
      draw(trio, { ganttWindow: window, eventLog: log });

    it('待ちの言う長さと代用かどうかは、どの幅でも同じである', () => {
      const claims = GANTT_WINDOWS.map((window) => ({
        label: window.label,
        ...claimOf(gtOf(at(window.key).container, '#2').querySelector('.gt-lag')),
      }));

      expect(claims, '幅の切り替えで、9 日の観測が「約 1 日、代用」になってはいけない').toEqual(
        GANTT_WINDOWS.map((window) => ({
          label: window.label,
          days: '9',
          approx: false,
          said: false,
        })),
      );
    });

    it('フラグの代用かどうかも、どの幅でも同じである', () => {
      const flags = GANTT_WINDOWS.map((window) => {
        const flag = gtOf(at(window.key).container, '#1').querySelector('.gt-flag');
        return {
          label: window.label,
          drawn: flag !== null,
          approx: (flag?.className ?? '').split(' ').includes('approx'),
        };
      });
      const drawn = flags.filter((flag) => flag.drawn);

      expect(drawn.length, '1 つの幅でしか立たないなら、比べたことにならない').toBeGreaterThan(1);
      for (const flag of drawn) {
        expect(flag, '同じ 1 回の close が、幅によって代用になったり観測になったりする').toEqual({
          label: flag.label,
          drawn: true,
          approx: false,
        });
      }
    });

    /** 線が結ぶと言っている 2 つの時刻。**位置ではなく、言葉の側から採る** ——
        位置は軸に収めてあるので、幅を変えれば動くのが正しい */
    const lineClaimOf = (node: Element | null) => {
      const title = node?.getAttribute('title') ?? '';
      return {
        from: /^(?:Opened|First event) ([\d\-: ]+) —/.exec(title)?.[1] ?? null,
        to: /— (?:last event|closed(?: around)?) ([\d\-: ]+)/.exec(title)?.[1] ?? null,
        approx: title.includes('taken from updated_at'),
      };
    };

    /* 線の両端を見る 2 行。**`#3` はどの幅でも終わりが軸の中に在り、狭い幅では始まりだけが
       軸の外へ出る** —— 端を軸で止める行でこそ、言うことが動かないかを見られる。 */
    const spanned = [
      issue('#0', { created_at: iso(200) }),
      issue('#3', { status: 'closed', created_at: iso(60), closed_at: iso(5) }),
    ];
    const spannedLog = read([{ id: '#0' }, { id: '#3' }]);
    const lineOf = (container: HTMLElement) => gtOf(container, '#3').querySelector('.gt-line');

    /* 線の両端も観測した時刻である。**幅で変わってよいのは、そこに置けるかどうかだけ** ——
       幅を切り替えただけで結ぶ時刻が動くなら、線は観測を語っていない。 */
    it('線が結ぶ 2 つの時刻は、どの幅でも同じである', () => {
      const lines = GANTT_WINDOWS.map((window) => {
        const { container } = draw(spanned, { ganttWindow: window.key, eventLog: spannedLog });
        return { label: window.label, ...lineClaimOf(lineOf(container)) };
      });
      const drawn = lines.filter((line) => line.from !== null);

      expect(drawn.length, '1 つの幅でしか引かないなら、比べたことにならない').toBeGreaterThan(1);
      for (const line of drawn) {
        expect(line, '幅を切り替えただけで、線の端が別の時刻を指すことになる').toEqual({
          label: line.label,
          from: absTime(NOW - 60 * DAY),
          to: absTime(NOW - 5 * DAY),
          approx: false,
        });
      }
    });

    /* 輪はどの幅でも置く。**置く位置は幅で動いてよいが、指す時刻は動いてはいけない** ——
       輪だけは軸の外でも端に寄せて置くので、位置と時刻が食い違うのはこの 1 つだけである。
       言葉のほうまで端に合わせると、幅を選んだ人が課題の開いた日を書き換えたことになる。 */
    it('輪はどの幅でも置き、指す時刻も変わらない', () => {
      const opens = GANTT_WINDOWS.map((window) => {
        const { container } = draw(spanned, { ganttWindow: window.key, eventLog: spannedLog });
        const open = gtOf(container, '#3').querySelector('.gt-open');
        return {
          label: window.label,
          at: /^Opened ([\d\-: ]+)/.exec(open?.getAttribute('title') ?? '')?.[1] ?? null,
        };
      });

      expect(opens, '幅を切り替えただけで、開いた時刻が消えたり別の日を指したりする').toEqual(
        GANTT_WINDOWS.map((window) => ({ label: window.label, at: absTime(NOW - 60 * DAY) })),
      );
    });

    /* 端に寄せて置いた輪は、**寄せたことを見た目でも言う** —— 硬い輪のままだと、狭い幅で
       見た人には軸の左端で開いた課題として読める。狭い幅と広い幅の両方で見て確かめる。 */
    it('端に寄せた輪だけが、寄せたことを見た目で言う', () => {
      const classOf = (window: IssuesTableProps['ganttWindow']) => {
        const { container } = draw(spanned, { ganttWindow: window, eventLog: spannedLog });
        return (gtOf(container, '#3').querySelector('.gt-open')?.className ?? '').split(' ');
      };

      expect(classOf(MONTH_MS), '軸の外に在る輪は、そこで開いたことにならない').toContain(
        'soft-from',
      );
      expect(classOf('all'), '軸の中に置けた輪までぼかすと、観測した時刻が推測に見える').toEqual([
        'gt-open',
      ]);
    });

    /* `all` の軸は出ている行で決まるので、絞り込みは軸を動かす。**軸が動いても、線が結ぶ
       時刻は動かない** —— 検索語を打った人が、開いた時刻と閉じた時刻を書き換えたことになる。 */
    it('絞り込みで軸が動いても、線が結ぶ 2 つの時刻は変わらない', () => {
      const whole = draw(spanned, { ganttWindow: 'all', eventLog: spannedLog });
      const filtered = draw(spanned, { ganttWindow: 'all', eventLog: spannedLog, query: '#3' });

      expect(rowsOf(filtered.container).length, '絞り込みで残るのは `#3` だけである').toBe(1);
      expect(
        lineClaimOf(lineOf(filtered.container)),
        '画面に残った行の数が、開いた時刻と閉じた時刻を決める',
      ).toEqual(lineClaimOf(lineOf(whole.container)));
      expect(
        lineClaimOf(lineOf(whole.container)).from,
        '両方とも黙っていては、比べたことにならない',
      ).toBe(absTime(NOW - 60 * DAY));
    });

    /* `all` の軸は出ている行で決まるので、絞り込みは軸を動かす。**軸が動いても、待ちの言う
       長さは動かない** —— 検索語を打った人が、待った日数を書き換えたことになる。 */
    it('絞り込みで行が画面から消えても、待ちの言う長さは変わらない', () => {
      const whole = draw(trio, { ganttWindow: 'all', eventLog: log });
      const filtered = draw(trio, { ganttWindow: 'all', eventLog: log, query: '#2' });
      const lagOf = (container: HTMLElement) => gtOf(container, '#2').querySelector('.gt-lag');

      expect(rowsOf(filtered.container).length, '絞り込みで残るのは `#2` だけである').toBe(1);
      expect(
        claimOf(lagOf(filtered.container)),
        '画面に残った行の数が、待った日数を決める',
      ).toEqual(claimOf(lagOf(whole.container)));
      expect(
        claimOf(lagOf(whole.container)).days,
        '両方とも黙っていては、比べたことにならない',
      ).toBe('9');
    });
  });

  /* 軸の右端は `soft-to` の境目でもある。**端ちょうどと 1 ミリ秒先を、同じ絵にしない** ——
     どちらも線は端まで届くので、境目が動いたことは絵からは分からない。 */
  it('軸の右端ちょうどで終わる待ちは、ぼかさない', () => {
    const blocker = issue('#1', { status: 'closed', created_at: iso(20), closed_at: iso(10) });
    const onEdge = drawGantt([blocker, issue('#2', { created_at: iso(0), deps: [blocks('#1')] })]);
    const past = drawGantt([
      blocker,
      issue('#2', { created_at: new Date(NOW + 1).toISOString(), deps: [blocks('#1')] }),
    ]);

    expect(
      gtOf(onEdge.container, '#2').querySelector('.gt-lag')?.className,
      '軸の端ちょうどは観測した時刻なので、ぼかさない',
    ).toBe('gt-lag');
    expect(
      gtOf(past.container, '#2').querySelector('.gt-lag')?.className,
      '1 ミリ秒でも先なら、軸の端で止めて引いている',
    ).toBe('gt-lag soft-to');
  });

  /* 既定の幅は `all` で、そこでは**いちばん古い課題の `created_at` が軸の左端そのもの**に
     なる。端ちょうどの輪を落とすと、既定の画面で軸を決めている行だけが、作られた時刻を
     読めなかった行と同じ絵になる。右端も同じで、いま作られた課題がそこに立つ。 */
  it('軸の端ちょうどに作られた課題にも、輪を置く', () => {
    const { container } = draw(
      [issue('#1', { created_at: iso(40) }), issue('#2', { created_at: iso(0) })],
      {
        ganttWindow: 'all',
        eventLog: read([{ id: '#1' }, { id: '#2' }]),
      },
    );
    const oldest = gtOf(container, '#1').querySelector('.gt-open');
    const newest = gtOf(container, '#2').querySelector('.gt-open');

    expect(pctOf(oldest, 'left'), '軸の左端を決めている行の輪が消える').toBe(0);
    expect(
      oldest?.getAttribute('title'),
      '輪が指すのは作られた時刻である。閉じた時刻のフラグと同じ言葉にすると、1 行に「閉じた」が 2 つ並ぶ',
    ).toBe(`Opened ${absTime(NOW - 40 * DAY)}`);
    expect(pctOf(newest, 'left'), 'いま作られた課題は軸の右端ちょうどに立つ').toBe(100);

    /* 端に立つ輪は、中央に置くと半分が隣の列に載る。**軸の外から寄せた輪だけの話ではない**
       —— 既定の幅では、この 2 行がいつも端に立っている。 */
    expect(oldest?.className.split(' '), '左端の輪が `.iupd` の上へはみ出す').toContain('at-start');
    expect(newest?.className.split(' ')).toContain('at-end');
    expect(
      [oldest, newest].map((node) => (node?.className ?? '').includes('soft')),
      '端ちょうどは観測した時刻そのものなので、ぼかさない',
    ).toEqual([false, false]);
  });

  /* 相手の閉じた時刻を一覧から読めないことは在る。**記録に `closed` が読めているなら、
     待ちの両端とも観測できている** —— 黙ると、まだ塞がれている行と同じ絵になる。 */
  it('一覧に閉じた時刻が無くても、記録に読めているなら待ちを引く', () => {
    const { container } = drawGantt(
      [
        issue('#1', {
          status: 'closed',
          created_at: iso(28),
          updated_at: null,
          closed_at: null,
        }),
        issue('#2', { created_at: iso(10), deps: [blocks('#1')] }),
      ],
      read([{ id: '#1', at: [20], kind: 'closed' }]),
    );
    const lag = gtOf(container, '#2').querySelector('.gt-lag');

    expect(lag?.className, '両端とも観測できている待ちを、ぼかして描かない').toBe('gt-lag');
    expect(
      lag?.getAttribute('title'),
      '相手の行には硬い点が出ているのに、待った 10 日はどこにも出ない',
    ).toBe('Waiting on #1 — 10d from #1 ending to this issue being created');
  });

  /* 同じ時刻で終わる相手が 2 つ在ることは在る。**どちらを採るかで、待ちの端が観測か代用かが
     変わる** —— `updated_at` は実際に閉じた時刻より後ろにしか出ないので、同じ時刻に読めた
     `closed_at` が在るなら、塞ぎが解けた時刻はそちらで観測できている。 */
  it('同じ時刻で終わる相手が 2 つ在るなら、観測した時刻を持つほうから測る', () => {
    const at = iso(16);
    const { container } = drawGantt([
      issue('#1', { status: 'closed', created_at: iso(28), closed_at: at, updated_at: at }),
      issue('#3', { status: 'closed', created_at: iso(28), closed_at: null, updated_at: at }),
      issue('#2', { created_at: iso(10), deps: [blocks('#3'), blocks('#1')] }),
    ]);
    const lag = gtOf(container, '#2').querySelector('.gt-lag');

    expect(lag?.className, '同じ 1 つの時刻を、依存の並び順で代用にしない').toBe('gt-lag');
    expect(lag?.getAttribute('title')).toContain('#1');
  });

  /* 点を組むのは一覧に渡された課題と全件の両方である。**片方にしか居ない行を黙って
     読み込み中にしない** —— 読み終えた記録の下で、その行だけが永久に読み込み中の顔で残る。 */
  it('全件に居ない行も、記録から読んだとおりに描く', () => {
    const { container } = drawGantt(
      [issue('#1', { created_at: iso(10) })],
      read([{ id: '#1', at: [5] }]),
      { all: [] },
    );
    const cell = gtOf(container, '#1');

    expect(
      cell.className,
      '読み終えた記録の下で、その行だけを読み込み中の顔にしない',
    ).not.toContain('reading');
    expect(cell.querySelectorAll('.gt-ev').length, '読めているイベントを落とさない').toBe(1);
  });

  it('見出しに目盛りを出す', () => {
    const { container } = drawGantt([issue('#1', { created_at: iso(20) })]);

    expect(
      container.querySelectorAll('.gt-head .tick').length,
      '目盛りが無いと、点がいつのことなのか読めない',
    ).toBeGreaterThan(0);
  });
});

describe('マイルストーンのグリッド', () => {
  const DAY = 86_400_000;
  const iso = (daysAgo: number) => new Date(NOW - daysAgo * DAY).toISOString();
  const withDue = (id: string, title: string, dueDaysAgo: number): Issue =>
    issue(id, {
      created_at: iso(25),
      github: { ...issue(id).github, milestone: { title, due_on: iso(dueDaysAgo) } },
    });

  /* 読み終えた記録。行に輪が出るので、期日の数だけ要素が増えていないかを数えられる */
  const readAll = (ids: readonly string[]): EventLog => ({
    kind: 'observed',
    complete: true,
    byId: new Map(ids.map((id) => [id, { id, events: [], truncated: false }])),
  });

  const drawGantt = (issues: readonly Issue[]) =>
    draw(issues, {
      ganttWindow: MONTH_MS,
      eventLog: readAll(issues.map((candidate) => candidate.id ?? '')),
    });

  it('線は一覧の背景として 1 枚だけ持ち、行ごとの要素にしない', () => {
    const { container } = drawGantt([withDue('#1', 'v2', 10), withDue('#2', 'v1', 20)]);
    const list = container.querySelector('#issues-list') as HTMLElement | null;
    const plain = drawGantt([issue('#1', { created_at: iso(25) })]);
    const countOf = (root: HTMLElement) =>
      root.querySelectorAll('.issue-row:not(.head) .gt > *').length;

    expect(countOf(plain.container), '輪が出ている行で数える').toBe(1);
    expect(
      countOf(container) / 2,
      '行ごとに線を引くと、行の中の要素が期日の数だけ増え、行の継ぎ目で線が切れる',
    ).toBe(countOf(plain.container));
    expect(list?.style.getPropertyValue('--gt-grid')).toContain('linear-gradient');
  });

  it('期日を読めないマイルストーンも、黙って消さずに数える', () => {
    const { container } = drawGantt([
      issue('#1', {
        created_at: iso(25),
        github: { ...issue('#1').github, milestone: { title: 'someday', due_on: null } },
      }),
    ]);
    const off = container.querySelector('.gt-head .gt-off.undated');

    expect(off?.textContent, '「期日が無い」と「そんなマイルストーンは無い」は違う').toBe('?1');
    expect(off?.getAttribute('title')).toContain('someday');
  });

  it('マイルストーンの名前は、見出しに 1 度だけ出す', () => {
    const { container } = drawGantt([withDue('#1', 'v2', 10), withDue('#2', 'v2', 10)]);
    const names = [...container.querySelectorAll('.gt-head .gt-ms')];

    expect(names.map((name) => name.textContent)).toEqual(['v2']);
    expect(names[0]?.getAttribute('title')).toContain('v2');
  });

  it('軸から外れた期日は、黙って落とさずに件数として出す', () => {
    const { container } = drawGantt([withDue('#1', 'shipped', 90)]);
    const off = container.querySelector('.gt-head .gt-off');

    expect(off?.textContent, '線を引けないことと、期日が無いことは違う').toContain('1');
    expect(off?.getAttribute('title')).toContain('shipped');
  });

  it('軸の先の期日も、黙って落とさずに件数として出す', () => {
    const { container } = drawGantt([withDue('#1', 'next', -60)]);
    const off = container.querySelector('.gt-head .gt-off.right');

    expect(off?.textContent, '幅を広げれば見えるものを、無いことにしない').toBe('1›');
    expect(off?.getAttribute('title')).toContain('next');
  });

  it('束の見出しにもトラックが在る', () => {
    const { container } = draw([withDue('#1', 'v2', 10)], {
      group: 'milestone',
      ganttWindow: MONTH_MS,
    });

    expect(
      container.querySelector('.iband .gt'),
      '見出しにトラックが無いと、線が見出しの行で切れる',
    ).not.toBe(null);
  });
});

describe('4 つの状態は、どれも別の絵になる', () => {
  const DAY = 86_400_000;
  const iso = (daysAgo: number) => new Date(NOW - daysAgo * DAY).toISOString();
  const one = [issue('#1', { created_at: iso(20) })];

  const drawLog = (eventLog: EventLog, issues: readonly Issue[] = one) =>
    draw(issues, { ganttWindow: MONTH_MS, eventLog });

  const gt = (container: HTMLElement) => {
    const cell = container.querySelector('.issue-row:not(.head) .gt');
    if (cell === null) throw new Error('トラックが無い');
    return cell;
  };

  const observed = (
    entries: readonly { id: string; at?: number[]; truncated?: boolean }[],
    complete = true,
  ): EventLog => ({
    kind: 'observed',
    complete,
    byId: new Map(
      entries.map((entry) => [
        entry.id,
        {
          id: entry.id,
          events: (entry.at ?? []).map((daysAgo) => ({ at: iso(daysAgo), kind: 'comment' })),
          truncated: entry.truncated ?? false,
        },
      ]),
    ),
  });

  it('読んでいる最中は、輪もフラグも出さない', () => {
    const { container } = drawLog({ kind: 'reading' }, [
      issue('#1', { status: 'closed', created_at: iso(20), closed_at: iso(4) }),
    ]);
    const cell = gt(container);

    expect(cell.className).toContain('reading');
    expect(cell.querySelector('.gt-line'), '読み終えて何も無かった行と同じ絵にしない').toBe(null);
    expect(cell.querySelector('.gt-open')).toBe(null);
    expect(cell.querySelector('.gt-flag')).toBe(null);
    expect(container.querySelector('.gt-head .gt-reading'), '動くものは画面に 1 つでよい').not.toBe(
      null,
    );
  });

  it('読み終えて何も起きていなければ、輪だけが残る', () => {
    const { container } = drawLog(observed([{ id: '#1' }]));
    const cell = gt(container);

    expect(cell.className, 'ハッチを掛けると、読めなかった行になる').not.toContain('unread');
    expect(cell.querySelector('.gt-line'), '観測した時刻が 1 つなら、結ぶ相手が居ない').toBe(null);
    expect(cell.querySelectorAll('.gt-ev').length).toBe(0);
    expect(cell.querySelector('.gt-open'), '作られた時刻は観測した時刻の 1 つである').not.toBe(
      null,
    );
    expect(cell.getAttribute('title')).toContain('No events on record');
  });

  it('読み終えたら、動くものも一覧の上の 1 文も残さない', () => {
    const { container } = drawLog(observed([{ id: '#1' }]));

    expect(
      container.querySelector('.gt-head .gt-reading'),
      '読み終えたのに走り続けるバーは、いつまでも読んでいるという嘘である',
    ).toBe(null);
    expect(
      container.querySelector('.iband.cut'),
      '全部読めているのに何か言うと、言うべきときの 1 文が読み流される',
    ).toBe(null);
  });

  it('切れていてイベントが 1 件も無い行には、ハッチを掛ける', () => {
    const { container } = drawLog(observed([{ id: '#1', truncated: true }]));
    const cell = gt(container);

    expect(cell.className, '読み切れなかった行を「何も起きなかった行」と同じ絵にしない').toContain(
      'unread',
    );
    expect(cell.querySelector('.gt-line')).toBe(null);
    expect(cell.getAttribute('title')).toContain('cut short');
  });

  it('観測できなかった行は、罫線を引かずにハッチを掛ける', () => {
    const { container } = drawLog({ kind: 'unobservable', reason: 'gh exited 1' });
    const cell = gt(container);

    expect(cell.className).toContain('unread');
    expect(cell.querySelector('.gt-line'), '読めていない行に、観測した時刻を結ぶ線は無い').toBe(
      null,
    );
    expect(
      cell.querySelector('.gt-open'),
      '別の観測が失敗したからといって、成り立っている観測を伏せない',
    ).not.toBe(null);
    expect(
      [...container.querySelectorAll('.iband.cut .iband-t > span')].map((node) => node.textContent),
      '理由は行ごとに繰り返さず、一覧の上で 1 度だけ言う',
    ).toEqual(['Issue events could not be read']);
    expect(container.querySelector('.iband.cut em')?.textContent).toBe('gh exited 1');
  });

  it('読むものが無かった行には、ハッチも罫線も掛けない', () => {
    const { container } = drawLog({ kind: 'absent' });
    const cell = gt(container);

    expect(cell.className).toContain('nolog');
    expect(cell.className, '無かったものを「読んでいない」と描かない').not.toContain('unread');
    expect(cell.querySelector('.gt-line')).toBe(null);
    expect(container.querySelector('.iband.cut .iband-t > span')?.textContent).toBe(
      'This project has no issue event log',
    );
  });

  it('1 件ぶんを読み切れなかった行は、切れ目のある区間を出す', () => {
    const { container } = drawLog(observed([{ id: '#1', at: [8], truncated: true }]));
    const cell = gt(container);

    expect(cell.querySelector('.gt-line'), '読めたところまでは読めている').not.toBe(null);
    const cut = cell.querySelector('.gt-cut');
    expect(cut, '30 件で切れた記録と、30 件しか無い記録を同じ絵にしない').not.toBe(null);
    expect(cut?.getAttribute('title')).toContain('30 most recent events');
  });

  /* 読めていない 4 つの理由は、どれも同じハッチ 1 枚で描かれる。**理由を分けているのは
     この文だけである** —— 2 つが同じ文になった時点で、画面の上では 1 つの答えになる。 */
  it('読めていない理由は、それぞれ別の文で言う', () => {
    const unreadable: EventLog = {
      kind: 'observed',
      complete: true,
      byId: new Map([
        ['#1', { id: '#1', events: [{ at: 'soon', kind: 'comment' }], truncated: false }],
      ]),
    };
    const logs: readonly EventLog[] = [
      { kind: 'reading' },
      { kind: 'absent' },
      { kind: 'unobservable', reason: 'gh exited 1' },
      { kind: 'observed', complete: true, byId: new Map() },
      observed([{ id: '#1', truncated: true }]),
      unreadable,
    ];
    const said = logs.map((eventLog) => gt(drawLog(eventLog).container).getAttribute('title'));

    expect(said).toEqual([
      'Reading the issue event log',
      'This project has no issue event log',
      'Issue events could not be read',
      'This issue was not in the event log that was read',
      'The event log was cut short before it reached any event on this issue',
      'The time on 1 event could not be read, so nothing is drawn here',
    ]);
    expect(new Set(said).size, '同じ文になった 2 つは、画面の上では 1 つの答えである').toBe(6);
  });

  it('読めた行は、読めた件数と最後の時刻を言う', () => {
    const { container } = drawLog(observed([{ id: '#1', at: [8] }]));

    expect(
      gt(container).getAttribute('title'),
      '何件をいつまで読めたのかは、点の並びからは数えられない',
    ).toMatch(/^1 event read, the last on 2026-08-01 /);
  });

  it('一部の時刻を読めなかったことは、読めた行の説明にも足す', () => {
    const partial: EventLog = {
      kind: 'observed',
      complete: true,
      byId: new Map([
        [
          '#1',
          {
            id: '#1',
            events: [
              { at: iso(8), kind: 'comment' },
              { at: 'soon', kind: 'labeled' },
            ],
            truncated: false,
          },
        ],
      ]),
    };

    expect(
      gt(drawLog(partial).container).getAttribute('title'),
      '落としたことを言わないと、件数が黙って減る',
    ).toContain('the time on 1 other event could not be read');
  });

  it('切れていたうえに時刻も読めないなら、その両方を言う', () => {
    const both: EventLog = {
      kind: 'observed',
      complete: true,
      byId: new Map([
        ['#1', { id: '#1', events: [{ at: 'soon', kind: 'comment' }], truncated: true }],
      ]),
    };

    expect(
      gt(drawLog(both).container).getAttribute('title'),
      '理由を 1 つに決めると、もう片方が黙って落ちる',
    ).toBe(
      'The time on 1 event could not be read, so nothing is drawn here — the event log was also cut short here',
    );
  });

  it('掛かっているハッチの理由を、一覧の上の 1 文はすべて言う', () => {
    const mixed: EventLog = {
      kind: 'observed',
      complete: true,
      byId: new Map([
        ['#1', { id: '#1', events: [], truncated: true }],
        ['#3', { id: '#3', events: [{ at: 'soon', kind: 'comment' }], truncated: false }],
      ]),
    };
    const { container } = drawLog(mixed, [
      issue('#1', { created_at: iso(20) }),
      issue('#2', { created_at: iso(20) }),
      issue('#3', { created_at: iso(20) }),
    ]);
    const note = container.querySelector('.iband.cut em')?.textContent ?? '';

    expect(note, '#1 は記録に居た。居なかったという 1 文の下に並べない').toContain(
      'for some, it stopped before any of their events',
    );
    expect(note, '#2 は記録に居なかった').toContain('they were not in the event log');
    expect(note, '#3 は記録に居て、時刻だけが読めなかった').toContain(
      'for some, no event time could be read',
    );
  });

  /* 文が説明するのは、いま並んでいる行である。絞り込みで消えた行の理由まで言うと、
     どの行にも当てはまらない説明が一覧の上に残る。 */
  it('絞り込みで画面から消えた行の理由は、一覧の上の 1 文が言わない', () => {
    const { container } = draw(
      [issue('#1', { created_at: iso(20) }), issue('#2', { created_at: iso(20) })],
      { ganttWindow: MONTH_MS, eventLog: observed([{ id: '#1', at: [8] }]), query: '#1' },
    );

    expect(rowsOf(container).length, '絞り込みで残るのは `#1` だけである').toBe(1);
    expect(
      container.querySelector('.iband.cut'),
      '残った行はどれも読めているのに、読めなかった行の説明が上に残ることになる',
    ).toBe(null);
  });

  it('どの行も読めていないなら、なおさら一覧の上の 1 文を黙らせない', () => {
    const { container } = drawLog(observed([{ id: '#1', truncated: true }]));

    expect(
      container.querySelector('.iband.cut em')?.textContent,
      '列が丸ごとハッチなのに 1 文も無いと、読めなかったことがどこにも残らない',
    ).toBe('for some, it stopped before any of their events');
  });

  it('全部の課題を辿れなかったとき、読めた行と読まなかった行が並ぶ', () => {
    const { container } = drawLog(observed([{ id: '#1', at: [8] }], false), [
      issue('#1', { created_at: iso(20) }),
      issue('#2', { created_at: iso(20) }),
    ]);
    const cells = [...container.querySelectorAll('.issue-row:not(.head) .gt')];

    expect(cells[0]?.className).not.toContain('unread');
    expect(cells[1]?.className, 'どこで読むのをやめたかが見えることに意味がある').toContain(
      'unread',
    );
    expect(container.querySelector('.iband.cut em')?.textContent).toBe(
      'the event log was cut short',
    );
  });
});

describe('行に触れると、関わりの無い弧が沈む', () => {
  /* 弧を沈めるのは行ごとではなく弧ごとである。行ごとに沈めると、明るい行どうしを結ぶ線が
     途中の暗い行で切れて辿れなくなる。 */
  const pairs = [
    issue('#1'),
    issue('#2', { deps: [blocks('#1')] }),
    issue('#8'),
    issue('#9', { deps: [blocks('#8')] }),
  ];

  const arcs = (container: HTMLElement) => {
    const shapes = [...container.querySelectorAll('.dep, .dep-cap')];
    return {
      lit: shapes.filter((shape) => shape.classList.contains('lit')).length,
      dim: shapes.filter((shape) => shape.classList.contains('dim')).length,
      all: shapes.length,
    };
  };

  it('触れている課題に繋がっている弧だけが残る', () => {
    const { container } = draw(pairs);
    const middle = rowsOf(container).find((row) => idOf(row) === '#2');
    if (middle === undefined) throw new Error('#2 の行が無い');

    fireEvent.mouseEnter(middle);
    const found = arcs(container);

    expect(found.lit, '触れている課題に繋がる弧が沈むと、依存が読めない').toBeGreaterThan(0);
    expect(found.dim, '関わりの無い弧まで残すと、絞り込んだ意味が無い').toBeGreaterThan(0);
    expect(found.lit + found.dim, 'どちらでもない弧を残さない').toBe(found.all);
  });

  it('誰にも触れていなければ、どの弧も沈めない', () => {
    const { container } = draw(pairs);
    const found = arcs(container);

    expect(found.all).toBeGreaterThan(0);
    expect(found.dim, '触れていないときに沈める弧が在ると、既定の表が読めない').toBe(0);
    expect(found.lit).toBe(0);
  });
});

describe('マイルストーンで束ねる', () => {
  const iso = (daysAgo: number) => new Date(NOW - daysAgo * 86_400_000).toISOString();

  const withMs = (id: string, title: string | null, dueOn: string | null, over = {}) =>
    issue(id, {
      ...over,
      github: {
        url: null,
        labels: [],
        assignees: [],
        author: null,
        milestone: title === null ? null : { title, due_on: dueOn },
        issue_type_color: null,
        sub_issues: null,
        pull_requests: [],
        comments: 0,
        reactions: 0,
      },
    });

  const bandsOf = (container: HTMLElement) =>
    [...container.querySelectorAll('.iband')].map((band) => ({
      title: band.querySelector('.iband-t > span')?.textContent ?? '',
      note: band.querySelector('em')?.textContent ?? '',
    }));

  it('束ねないときは見出しを出さない', () => {
    const { container } = draw([withMs('#1', '1.4', null)], { group: undefined });

    expect(bandsOf(container)).toEqual([]);
  });

  it('期日の近い順に束ね、付いていない課題を最後に置く', () => {
    const { container } = draw(
      [withMs('#1', null, null), withMs('#2', '1.5', iso(-30)), withMs('#3', '1.4', iso(-10))],
      { group: 'milestone' },
    );

    expect(bandsOf(container).map((band) => band.title)).toEqual(['1.4', '1.5', 'No milestone']);
  });

  it('見出しの件数は、出ている課題だけで数える', () => {
    const { container } = draw(
      [
        withMs('#1', '1.4', null),
        withMs('#2', '1.4', null, { status: 'closed' }),
        withMs('#3', '1.4', null),
      ],
      { group: 'milestone' },
    );

    expect(bandsOf(container)[0]?.note, '絞る前の件数を出すと、見出しと行が食い違う').toContain(
      '2 of 3 open',
    );
  });

  it('期日を持つ束は、期日も見出しに出す', () => {
    const { container } = draw([withMs('#1', '1.4', iso(-10))], { group: 'milestone' });

    expect(bandsOf(container)[0]?.note).toContain('in 10d');
  });

  it('束ねても行そのものは全部出る', () => {
    const { container } = draw([withMs('#1', '1.4', null), withMs('#2', null, null)], {
      group: 'milestone',
    });

    expect(rowsOf(container).map(idOf)).toEqual(['#1', '#2']);
  });

  it('束ねているときは、行にマイルストーンの名前を繰り返さない', () => {
    const grouped = draw([withMs('#1', '1.4', null)], { group: 'milestone' });
    const flat = draw([withMs('#2', '1.4', null)], { group: undefined });

    expect(
      grouped.container.querySelector('.mschip'),
      '束の見出しが既に言っているので、行ごとに繰り返すと同じことが 2 度並ぶ',
    ).toBeNull();
    expect(flat.container.querySelector('.mschip')).not.toBeNull();
  });
});

/* 課題の行に出る、PR のブランチ。**手元の git を読めていないことを、空欄で表さない** ——
   空欄は「このブランチは遅れても衝突してもいない」と同じ絵で、衝突しているブランチが
   その顔で並ぶ。 */
describe('PR のブランチの、手元での状態', () => {
  const withPull = issue('#1', {
    github: {
      ...issue('#1').github,
      pull_requests: [
        {
          number: 7,
          state: 'OPEN',
          is_draft: false,
          review_decision: null,
          head_ref_name: 'feat/x',
        },
      ],
    },
  } as Partial<Issue>);

  const join = (reach: 'observed' | 'pending' | 'unobservable', tips: unknown[] = []) =>
    buildWorkJoin(tips.length === 0 ? null : ({ tips, conflicts: [] } as never), reach, [withPull]);

  it('観測できていれば、遅れの数を出す', () => {
    const { container } = draw([withPull], {
      join: join('observed', [
        { name: 'feat/x', kind: 'branch', ahead: 2, behind: 1, worktree: null },
      ]),
    });
    const chip = container.querySelector('.brstate');

    expect(chip?.classList.contains('unread')).toBe(false);
    expect(chip?.textContent).toContain('↓1');
  });

  it.each([
    ['unobservable', '?'],
    ['pending', '—'],
  ] as const)('%s なら、名前を出して数の代わりに %s を立てる', (reach, mark) => {
    const { container } = draw([withPull], { join: join(reach) });
    const chip = container.querySelector('.brstate');

    expect(chip?.classList.contains('unread'), '読めていないことが見た目に残らない').toBe(true);
    expect(chip?.textContent).toContain('feat/x');
    expect(chip?.textContent).toContain(mark);
  });

  /* git のリポジトリでないディレクトリにブランチが無いのは、観測して言える事実である */
  it('観測できていてブランチが無ければ、何も出さない', () => {
    const { container } = draw([withPull], { join: join('observed') });

    expect(container.querySelector('.brstate')).toBe(null);
  });

  /* 閉じた PR のブランチは、たいてい手元にも残っていない。ここに出すと、片付いた課題の行が
     読めなかったことの文字で埋まる */
  it('閉じた PR しか持たない課題には、読めなくても何も出さない', () => {
    const merged = issue('#2', {
      github: {
        ...issue('#2').github,
        pull_requests: [
          {
            number: 9,
            state: 'MERGED',
            is_draft: false,
            review_decision: null,
            head_ref_name: 'feat/gone',
          },
        ],
      },
    } as Partial<Issue>);
    const { container } = draw([merged], {
      join: buildWorkJoin(null, 'unobservable', [merged]),
    });

    expect(container.querySelector('.brstate')).toBe(null);
  });

  /* 同じ行の PR のチップと別の PR を名指すと、どちらの話なのかが読めない */
  it('名指すのは、行の PR のチップと同じ PR である', () => {
    const twice = issue('#3', {
      github: {
        ...issue('#3').github,
        pull_requests: [
          {
            number: 1,
            state: 'CLOSED',
            is_draft: false,
            review_decision: null,
            head_ref_name: 'feat/old',
          },
          {
            number: 2,
            state: 'OPEN',
            is_draft: false,
            review_decision: null,
            head_ref_name: 'feat/new',
          },
        ],
      },
    } as Partial<Issue>);
    const { container } = draw([twice], {
      join: buildWorkJoin(null, 'unobservable', [twice]),
    });

    expect(container.querySelector('.brstate')?.textContent).toContain('feat/new');
  });
});
