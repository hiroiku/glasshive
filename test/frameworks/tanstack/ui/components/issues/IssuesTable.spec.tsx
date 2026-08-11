import { fireEvent, render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import {
  IssuesTable,
  type IssuesTableProps,
} from '~/frameworks/tanstack/ui/components/issues/IssuesTable.tsx';
import { DEFAULT_GANTT_WINDOW, MONTH_MS } from '~/frameworks/tanstack/ui/derive/issueGantt.ts';

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

    const heads = [...container.querySelectorAll('.iband > span')].map((node) => node.textContent);

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

describe('右のタイムライン', () => {
  const DAY = 86_400_000;
  const iso = (daysAgo: number) => new Date(NOW - daysAgo * DAY).toISOString();

  /* 1 か月の幅で見る。`all` は出ている課題で軸が決まるので、位置を数で確かめられない */
  const drawGantt = (issues: readonly Issue[]) => draw(issues, { ganttWindow: MONTH_MS });

  const rowOf = (container: HTMLElement, id: string) => {
    const row = rowsOf(container).find((candidate) => idOf(candidate) === id);
    if (row === undefined) throw new Error(`${id} の行が無い`);
    return row;
  };

  const pctOf = (node: Element | null, property: 'left' | 'width'): number =>
    Number.parseFloat((node as HTMLElement | null)?.style.getPropertyValue(property) ?? 'NaN');

  it('バーは軸の上の位置と長さで引かれる', () => {
    const { container } = drawGantt([
      issue('#1', {
        status: 'closed',
        created_at: iso(15),
        updated_at: iso(5),
        closed_at: iso(5),
      }),
    ]);
    const bar = rowOf(container, '#1').querySelector('.gt-bar');

    expect(pctOf(bar, 'left'), '15 日前は 30 日の軸のちょうど半ばである').toBeCloseTo(50, 5);
    expect(pctOf(bar, 'width'), '10 日ぶんの幅は 30 日の軸の 3 分の 1 である').toBeCloseTo(
      100 / 3,
      5,
    );
  });

  it('`created_at` を読めない課題には、バーを引かない', () => {
    const { container } = drawGantt([issue('#1'), issue('#2', { created_at: iso(3) })]);

    expect(
      rowOf(container, '#1').querySelector('.gt-bar'),
      '現在で代用すると、いま作られたという持っていない事実を描くことになる',
    ).toBe(null);
    expect(rowOf(container, '#2').querySelector('.gt-bar')).not.toBe(null);
  });

  it('閉じたバーと開いたバーを、同じ見た目にしない', () => {
    const { container } = drawGantt([
      issue('#1', { status: 'closed', created_at: iso(9), updated_at: iso(2) }),
      issue('#2', { created_at: iso(9) }),
    ]);
    const done = rowOf(container, '#1').querySelector('.gt-bar');
    const live = rowOf(container, '#2').querySelector('.gt-bar');

    expect(done?.className).toContain('done');
    expect(live?.className).toContain('live');
    expect(
      done?.getAttribute('title'),
      '閉じた時刻は `updated_at` からの近似である。画面の側で言い落とすと、近似が観測に化ける',
    ).toContain('updated_at');
  });

  it('状態の色は、行のチップと同じところから採る', () => {
    const { container } = drawGantt([issue('#1', { status: 'blocked', created_at: iso(4) })]);

    expect(
      rowOf(container, '#1').querySelector('.gt-bar')?.className,
      'バーだけ別の色にすると、行の中で状態が 2 つの意味を持つ',
    ).toContain('st-blocked');
  });

  it('堰き止めていた相手が先に片付いていれば、待ちの線を引く', () => {
    const { container } = drawGantt([
      issue('#1', { status: 'closed', created_at: iso(20), updated_at: iso(16) }),
      issue('#2', { created_at: iso(10), deps: [blocks('#1')] }),
    ]);
    const lag = rowOf(container, '#2').querySelector('.gt-lag');

    expect(pctOf(lag, 'left'), '16 日前は 30 日の軸の 14 日目である').toBeCloseTo(
      (14 / 30) * 100,
      5,
    );
    expect(pctOf(lag, 'width'), '待った 6 日ぶんの幅である').toBeCloseTo((6 / 30) * 100, 5);
    expect(lag?.getAttribute('title')).toContain('#1');
    expect(rowOf(container, '#1').querySelector('.gt-lag'), '待つ相手が無い行には引かない').toBe(
      null,
    );
  });

  it('相手がこの課題より後に終わるなら、待ちの線を引かない', () => {
    const { container } = drawGantt([
      issue('#1', { created_at: iso(20) }),
      issue('#2', { created_at: iso(10), deps: [blocks('#1')] }),
    ]);

    expect(
      rowOf(container, '#2').querySelector('.gt-lag'),
      '逆向きの線は、待っていない期間を待ったと描く',
    ).toBe(null);
  });

  it('待ちを決めるのは、いちばん後に終わる相手である', () => {
    const { container } = drawGantt([
      issue('#1', { status: 'closed', created_at: iso(25), updated_at: iso(22) }),
      issue('#2', { created_at: iso(20) }),
      issue('#3', { created_at: iso(10), deps: [blocks('#1'), blocks('#2')] }),
    ]);

    expect(
      rowOf(container, '#3').querySelector('.gt-lag'),
      'まだ塞いでいる相手が居るのに、先に片付いた相手から待ちを引くと、空いていた期間が伸びる',
    ).toBe(null);
  });

  it('区切りの期日を、どの行にも同じ位置で引く', () => {
    const withDue = (id: string, over: Partial<Issue> = {}): Issue =>
      issue(id, {
        created_at: iso(12),
        github: { ...issue(id).github, milestone: { title: 'v2', due_on: iso(10) } },
        ...over,
      });
    const { container } = drawGantt([withDue('#1'), withDue('#2')]);

    const guides = [...container.querySelectorAll('.issue-row:not(.head) .gt-guide')];
    expect(guides.length, '行ごとに引くから、一覧を下へ辿るときの縦の目印になる').toBe(2);
    for (const guide of guides) {
      expect(pctOf(guide, 'left')).toBeCloseTo((20 / 30) * 100, 5);
      expect(guide.getAttribute('title')).toContain('v2');
    }
  });

  it('見出しに目盛りを出す', () => {
    const { container } = drawGantt([issue('#1', { created_at: iso(20) })]);

    expect(
      container.querySelectorAll('.gt-head .tick').length,
      '目盛りが無いと、バーの長さが何日ぶんなのか読めない',
    ).toBeGreaterThan(0);
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
      title: band.querySelector('span')?.textContent ?? '',
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
