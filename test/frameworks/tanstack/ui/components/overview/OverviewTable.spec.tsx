import { fireEvent, render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import {
  OverviewTable,
  type OverviewTableProps,
} from '~/frameworks/tanstack/ui/components/overview/OverviewTable.tsx';

/* 一覧は、読めたプロジェクトから順に埋まっていく。

   **埋まる前の行が、埋まった行と同じ顔をしてはいけない。** 行そのものは索引で確定して
   いるので並んでよいが、数はまだ 1 つも無い。そこに `0` や空欄を置くと、画面は
   「このプロジェクトでは何も動いていない」と断定することになる。

   ここで見るのはその境目である。 */

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, className }: { children: React.ReactNode; className?: string }) => (
    <a href="/" className={className}>
      {children}
    </a>
  ),
}));

type Row = OverviewTableProps['rows'][number];

const NOW = 1_700_000_000_000;
const DAY_MS = 86_400_000;

const readRow = (overrides: Partial<Row> = {}): Row => ({
  id: 'read',
  name: 'read',
  path: '/w/read',
  parent: null,
  read: true,
  active: 0,
  waiting: 0,
  input: 0,
  tokens24h: 0,
  tokens24hState: 'observed',
  lastActivityMs: NOW,
  liveProcess: false,
  sourcesState: 'observed',
  spans: [],
  spansComplete: true,
  ...overrides,
});

/** まだ読んでいない行。識別だけが在り、数はどれも `null` */
const unreadRow = (overrides: Partial<Row> = {}): Row => ({
  id: 'unread',
  name: 'unread',
  path: '/w/unread',
  parent: null,
  read: false,
  active: null,
  waiting: null,
  input: null,
  tokens24h: null,
  tokens24hState: 'absent',
  lastActivityMs: null,
  liveProcess: false,
  sourcesState: 'observed',
  spans: [],
  spansComplete: false,
  ...overrides,
});

const draw = (rows: readonly Row[], over: Partial<OverviewTableProps> = {}) =>
  render(
    <OverviewTable
      rows={rows}
      order={{ key: 'standing', direction: 'desc' }}
      onSort={() => undefined}
      pinned={new Set()}
      onTogglePin={() => undefined}
      nowMs={NOW}
      spanMs={DAY_MS}
      {...over}
    />,
  );

describe('読み終える前の行', () => {
  it('数の欄に `0` を出さない', () => {
    const { container } = draw([unreadRow()]);

    const row = container.querySelector('.dash-row');
    expect(
      row?.textContent,
      '`0` は「読んで、1 つも動いていなかった」という断定である',
    ).not.toContain('0');
  });

  it('数の欄を空にもしない', () => {
    const { container } = draw([unreadRow()]);

    expect(
      container.textContent,
      '空欄は「0 だった」と読める。読んでいないことは、読んでいないと言う',
    ).toContain('—');
  });

  it('まだ読んでいないことを、指せば分かるようにする', () => {
    const { container } = draw([unreadRow()]);

    const marked = container.querySelectorAll('[title="Not read yet"]');
    expect(marked.length, '数の欄はどれも、読んでいないと言えなければならない').toBeGreaterThan(0);
  });

  it('状態の点を塗らない', () => {
    const { container } = draw([unreadRow()]);

    expect(
      container.querySelector('.dot.unknown'),
      '塗った点は状態の断定である。読む前に言えることではない',
    ).not.toBeNull();
    expect(
      container.querySelector('.dot.ended'),
      '`ended` は「何も動いていない」という断定である',
    ).toBeNull();
  });

  it('行そのものは並ぶ', () => {
    const { container } = draw([unreadRow()]);

    expect(
      container.textContent,
      '行は索引で確定しているので、読み終える前から並んでよい',
    ).toContain('unread');
  });
});

describe('読み終えた行', () => {
  it('`0` は空欄のままにする', () => {
    const { container } = draw([readRow()]);

    expect(
      container.querySelector('[title="Not read yet"]'),
      '読んだ行に「読んでいない」と書かない',
    ).toBeNull();
    expect(container.textContent, '読んで 0 だったなら、空欄でよい').not.toContain('—');
  });

  it('動いている数はそのまま出す', () => {
    const { container } = draw([readRow({ active: 3, liveProcess: true })]);

    expect(container.textContent).toContain('3');
    expect(container.querySelector('.dot.active')).not.toBeNull();
  });
});

/* 走査できないディレクトリを 1 つ抱えた行は、読み終えた後も数が揃わない。
 **そこで 0 と空欄を並べると、見に行けなかったことが「静かだった」として読まれる。** */
describe('数え上げられなかった行', () => {
  const shortRow = (overrides: Partial<Row> = {}): Row =>
    readRow({
      id: 'short',
      name: 'short',
      sourcesState: 'unobservable',
      lastActivityMs: null,
      spansComplete: false,
      tokens24h: null,
      tokens24hState: 'unobservable',
      ...overrides,
    });

  it('数の欄に、数え終えた顔をさせない', () => {
    const { container } = draw([shortRow()]);

    const marked = container.querySelectorAll(
      '[title="Some of this project could not be read — the count may be short"]',
    );
    expect(marked.length, '0 のままでは「1 つも動いていない」という断定になる').toBeGreaterThan(0);
    expect(container.textContent).toContain('+?');
  });

  it('状態の点を塗らない', () => {
    const { container } = draw([shortRow({ liveProcess: true })]);

    expect(
      container.querySelector('.dot.unknown'),
      '見えなかった側で動いているセッションが居ないとは言えない',
    ).not.toBeNull();
    expect(container.querySelector('.dot.ended')).toBeNull();
    expect(container.querySelector('.dot.waiting')).toBeNull();
  });

  it('稼働のトラックを、静かだったトラックとして出さない', () => {
    const { container } = draw([shortRow()]);

    const strip = container.querySelector('.dash-act');
    expect(strip?.className, '空のトラックに「0 runs in view」と書かない').toContain('cut');
    expect(strip?.getAttribute('title')).toContain('could not be read');
  });

  it('消費を空欄にしない', () => {
    const { container } = draw([shortRow()]);

    expect(
      container.querySelector('.dash-tok')?.textContent,
      '空欄は「使っていない」と並んで見えてしまう',
    ).toContain('?');
  });

  it('最終活動を空欄にしない', () => {
    const { container } = draw([shortRow()]);

    const cells = [...container.querySelectorAll('.dash-row:not(.head) > span.right.dimtxt')];
    expect(
      cells.at(-1)?.textContent,
      '空欄は「ずっと静かだった」と読める。時刻が見えていないことは、そう言う',
    ).toBe('?');
  });
});

describe('読み終えた行と読み終えていない行が混じるとき', () => {
  it('読んだ行だけが数を出す', () => {
    const { container } = draw([readRow({ active: 2, liveProcess: true }), unreadRow()]);

    // 見出しも同じ class を持つので、行だけを採る
    const rows = [...container.querySelectorAll('.dash-row')].filter(
      (found) => !found.classList.contains('head'),
    );
    expect(rows).toHaveLength(2);
    expect(rows[0]?.textContent, '読んだ行は数を出す').toContain('2');
    expect(rows[1]?.textContent, '読んでいない行は数を出さない').toContain('—');
  });
});

/* 一覧は表である。**`aria-sort` は `columnheader` にしか置けず、`columnheader` は `row` の
   中、`row` は `grid` の中にしか居られない。** 見出しを `button` にしただけでは、その並びが
   どの列の話なのかがどこにも結び付かない。 */
describe('表として、支援技術に渡す', () => {
  /** 列の見出しを、そこに出ている名前で引く */
  const headOf = (container: HTMLElement, label: string): HTMLElement => {
    const found = [...container.querySelectorAll('.dash-row.head > [role="columnheader"]')].find(
      (header) => header.textContent === label,
    );
    if (found === null || found === undefined) throw new Error(`no column header for ${label}`);
    return found as HTMLElement;
  };

  it('表として並ぶ', () => {
    const { container } = draw([readRow()]);
    const grid = container.querySelector('.dash-grid');

    expect(grid?.getAttribute('role')).toBe('grid');
    expect(grid?.getAttribute('aria-label'), '名前の無い表は、何の表か言えない').not.toBeNull();
  });

  /* `grid` が持てるのは `row` と `rowgroup` だけである。列を持たないものを中に置くと、
     読み上げは表として辿れなくなる。 */
  it('表の直の子は、行だけにする', () => {
    const { container } = draw([readRow(), unreadRow()]);
    const grid = container.querySelector('.dash-grid');

    expect([...(grid?.children ?? [])].map((child) => child.getAttribute('role'))).toEqual([
      'row',
      'row',
      'row',
    ]);
  });

  it('見出しの数と、行のセルの数が揃う', () => {
    const { container } = draw([readRow()]);
    const headers = container.querySelectorAll('.dash-row.head > [role="columnheader"]');

    expect(headers.length).toBeGreaterThan(0);
    expect(
      container.querySelectorAll('.dash-row:not(.head) > [role="gridcell"]'),
      '数が食い違う行は、どの列を読んでいるのか分からなくなる',
    ).toHaveLength(headers.length);
  });

  it('見出しは、いまどう並んでいるかを名乗る', () => {
    const { container } = draw([readRow()], { order: { key: 'active', direction: 'desc' } });

    expect(headOf(container, 'Active').getAttribute('aria-sort')).toBe('descending');
    expect(headOf(container, 'Waiting').getAttribute('aria-sort')).toBe('none');
  });

  /* 並びの向きは `columnheader` にしか置けず、その `columnheader` を押しどころにすると
     今度は「押せる」ことが読み上げから消える。入れ子にすれば、どちらも失わない。 */
  it('並べ替えられる見出しは、押しどころを中に持つ', () => {
    const { container } = draw([readRow()], { order: { key: 'active', direction: 'asc' } });
    const press = headOf(container, 'Active').querySelector('button');

    expect(press, '見出しそのものを押しどころにすると、押せることが読まれない').not.toBeNull();
    expect(press?.getAttribute('type')).toBe('button');
    expect(press?.getAttribute('aria-sort'), '並びの向きを言うのはセルの側である').toBeNull();
  });

  it('見出しを押すと並べ替わる', () => {
    const onSort = vi.fn();
    const { container } = draw([readRow()], { onSort });

    fireEvent.click(headOf(container, 'Active').querySelector('button') as HTMLElement);

    expect(onSort).toHaveBeenCalledWith('active');
  });

  it('ピン留めは、セルの中の button のままである', () => {
    const { container } = draw([readRow()]);
    const pin = container.querySelector('.pin');

    expect(pin?.tagName, 'セルそのものを押しどころにすると、留めたかどうかが読めない').toBe(
      'BUTTON',
    );
    expect(pin?.getAttribute('aria-pressed')).toBe('false');
    expect(pin?.closest('[role="gridcell"]')).not.toBeNull();
  });

  it('プロジェクトの名前は、セルの中のリンクのままである', () => {
    const { container } = draw([readRow()]);
    const link = container.querySelector('.dash-name');

    expect(link?.tagName).toBe('A');
    expect(link?.closest('[role="gridcell"]')).not.toBeNull();
  });
});

/* プロジェクトの中で動いていた時間を、全エージェントの和集合としてトラック 1 本に描く。
 **行をまたいで同じ軸に載っている**から、並べて比べられる。 */
describe('稼働のトラック', () => {
  it('期間の中に入る稼働だけを描く', () => {
    const { container } = draw([
      readRow({
        spans: [
          [NOW - 40 * 60_000, NOW - 30 * 60_000],
          [NOW - 5 * DAY_MS, NOW - 5 * DAY_MS + 60_000],
        ],
      }),
    ]);

    expect(
      container.querySelectorAll('.dash-act i'),
      '軸の外の稼働まで描くと、端に潰れて読めないトラックになる',
    ).toHaveLength(1);
  });

  it('全部を見られていないトラックは、そう言う', () => {
    const { container } = draw([readRow({ spansComplete: false })]);

    expect(container.querySelector('.dash-act')?.className).toContain('cut');
  });

  it('まだ読んでいない行に、静かだった時間を描かない', () => {
    const { container } = draw([unreadRow({ spans: [] })]);

    const strip = container.querySelector('.dash-act');
    expect(strip?.querySelectorAll('i'), '読む前の空を「静かだった」として出さない').toHaveLength(
      0,
    );
    expect(strip?.getAttribute('title')).toBe('Not read yet');
  });
});
