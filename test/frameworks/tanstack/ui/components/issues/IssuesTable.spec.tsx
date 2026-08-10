import { fireEvent, render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import {
  IssuesTable,
  type IssuesTableProps,
} from '~/frameworks/tanstack/ui/components/issues/IssuesTable.tsx';

/* 一覧は「次に何を取るか」を答える表である。

   着手順で並べたときに束の見出しが入ることと、行に触れたときに関わりのある行だけが
   残ることを見る。**どちらも、並び順そのものではなく読み方を決める仕掛けである** ——
   落ちても表は出てしまうので、目で気付けない。 */

/* 題名の中の語を課題や `ref` へ結ぶところは、台帳を読みに行く。ここで見たいのは
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
  priority: null,
  issue_type: null,
  labels: [],
  assignee: null,
  owner: null,
  created_at: null,
  updated_at: '2026-08-09T11:00:00Z',
  deps: [],
  deps_complete: true,
  github: null,
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
