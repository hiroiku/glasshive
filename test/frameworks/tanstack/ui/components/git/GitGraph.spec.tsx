import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { GitGraph, type GitGraphProps } from '~/frameworks/tanstack/ui/components/git/GitGraph.tsx';

/* Git の行が持っているのは、ブランチの名前だけではない。

   **行を `button` にすると、中身が全部消える。** `button` は中の要素を読み上げから外す役なので、
   ahead / behind も sha も更新の時刻も、行の名前 1 つに置き換わる。中に入れ子になっている
   チップも、そこでは押しどころとして不正になる。 */

const nav = vi.hoisted(() => ({
  openRef: vi.fn(),
  openIssue: vi.fn(),
  openConv: vi.fn(),
  gotoMilestone: vi.fn(),
}));

vi.mock('~/frameworks/tanstack/ui/nav/NavContext.tsx', () => ({ useNav: () => nav }));

/* 材料の形は、表そのものが受け取る形から引く。写し取ると、形が変わってもここだけ通り続ける */
type OverviewJson = GitGraphProps['overview'];
type TipJson = OverviewJson['tips'][number];
type MainNodeJson = OverviewJson['mainline'][number];

const NOW = Date.parse('2026-08-09T12:00:00.000Z');
const AT = new Date(NOW - 600_000).toISOString();

const tip = (name: string, over: Partial<TipJson> = {}): TipJson => ({
  kind: 'branch',
  name,
  sha: `${name}0123456789abcdef`,
  date: AT,
  subject: `${name} subject`,
  worktree: null,
  merge_base: 'base0123456789',
  ahead: 3,
  behind: 2,
  ...over,
});

const node = (sha: string, over: Partial<MainNodeJson> = {}): MainNodeJson => ({
  sha,
  merge: false,
  date: AT,
  subject: `subject of ${sha}`,
  ...over,
});

const overview = (over: Partial<OverviewJson> = {}): OverviewJson => ({
  state: 'observed',
  reason: null,
  base: 'main',
  worktrees: [],
  branches: [],
  mainline: [node('base0123456789')],
  mainline_truncated: false,
  tips: [tip('feature')],
  conflicts: [],
  ...over,
});

const draw = (over: Partial<GitGraphProps> = {}) => {
  // コミットの題名から、本文の中の課題を引く問い合わせが走る。返事は見ないので `QueryClient` だけ渡す
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <GitGraph
        overview={overview()}
        project={undefined}
        query=""
        onQuery={() => {}}
        order={{ key: 'name', direction: 'asc' }}
        onSort={() => {}}
        nowMs={NOW}
        {...over}
      />
    </QueryClientProvider>,
  );
};

/** 行を、そこに出ている名前で引く */
const rowOf = (name: string): HTMLElement => {
  const found = [...document.querySelectorAll('#git-rows .git-row')].find((row) =>
    row.textContent?.includes(name),
  );
  if (found === null || found === undefined) throw new Error(`no row for ${name}`);
  return found as HTMLElement;
};

const cellsOf = (row: HTMLElement) => [...row.querySelectorAll(':scope > [role="gridcell"]')];

/** 列の見出しを、そこに出ている名前で引く */
const headOf = (label: string): HTMLElement => {
  const found = [...document.querySelectorAll('.git-row.head [role="columnheader"]')].find(
    (header) => header.textContent === label,
  );
  if (found === null || found === undefined) throw new Error(`no column header for ${label}`);
  return found as HTMLElement;
};

describe('行の中身を、支援技術に渡す', () => {
  it('表として並び、行は 5 個のセルを持つ', () => {
    draw();

    expect(document.querySelector('#git-rows')?.getAttribute('role')).toBe('grid');
    expect(cellsOf(rowOf('feature')), '行の中身が、行の名前 1 つに置き換わっている').toHaveLength(
      5,
    );
  });

  it('行そのものは名前を名乗らない', () => {
    draw();
    const row = rowOf('feature');

    expect(row.getAttribute('role')).toBe('row');
    expect(row.getAttribute('aria-label'), '名前を持つと、中の 5 個のセルが消える').toBeNull();
    expect(row.getAttribute('aria-describedby')).not.toBeNull();
  });

  it('コミットの行も、中身をセルとして渡す', () => {
    draw();
    const row = rowOf('subject of base');

    expect(row.getAttribute('role')).toBe('row');
    expect(row.getAttribute('aria-label')).toBeNull();
    expect(cellsOf(row)).toHaveLength(5);
  });

  it('ahead / behind と sha は、行の中に残る', () => {
    draw();
    const text = cellsOf(rowOf('feature'))
      .map((cell) => cell.textContent)
      .join(' ');

    expect(text).toContain('+3');
    expect(text).toContain('−2');
    expect(text).toContain('feature01');
  });

  it('開く操作の説明は、どの行からも辿れる 1 つに置く', () => {
    draw();
    const id = rowOf('feature').getAttribute('aria-describedby') ?? '';

    expect(document.getElementById(id)?.textContent).toContain('open');
    expect(rowOf('subject of base').getAttribute('aria-describedby')).toBe(id);
  });

  it('説明そのものは、表の外に置く', () => {
    draw();
    const id = rowOf('feature').getAttribute('aria-describedby') ?? '';

    expect(document.getElementById(id)?.closest('#git-rows') ?? null).toBeNull();
  });

  it('行はキーボードからも開ける', () => {
    draw();

    fireEvent.keyDown(rowOf('feature'), { key: 'Enter' });

    expect(nav.openRef).toHaveBeenCalledWith('feature', 'feature');
  });

  it('列の見出しは、いまどう並んでいるかを名乗る', () => {
    draw({ order: { key: 'ahead', direction: 'desc' } });
    const headers = [...document.querySelectorAll('.git-row.head [role="columnheader"]')];

    expect(headers).toHaveLength(5);
    const sorted = headers.filter((header) => header.getAttribute('aria-sort') === 'descending');
    expect(sorted).toHaveLength(1);
    expect(sorted[0]?.textContent).toBe('Ahead');
  });

  /* 並びの向きは `columnheader` にしか置けず、`columnheader` を押しどころにすると
     今度は「押せる」ことが読み上げから消える。入れ子にすれば、どちらも失わない。 */
  it('並べ替えられる見出しは、押しどころを中に持つ', () => {
    draw({ order: { key: 'ahead', direction: 'desc' } });
    const header = headOf('Ahead');
    const press = header.querySelector('button');

    expect(press, '見出しそのものを押しどころにすると、押せることが読まれない').not.toBeNull();
    expect(press?.getAttribute('type')).toBe('button');
    expect(header.getAttribute('aria-sort')).toBe('descending');
    expect(press?.getAttribute('aria-sort'), '並びの向きを言うのはセルの側である').toBeNull();
  });

  it('見出しを押すと、その列で並べ替わる', () => {
    const onSort = vi.fn();
    draw({ onSort });

    fireEvent.click(headOf('Ahead').querySelector('button') as HTMLElement);

    expect(onSort).toHaveBeenCalledWith('ahead');
  });

  it('見出しのセルそのものは、タブ順に入らない', () => {
    draw();

    expect(
      headOf('Ahead').getAttribute('tabindex'),
      '止まる場所が 2 つ並ぶと、押せるのがどちらか分からない',
    ).toBeNull();
  });

  /* `grid` が持てるのは `row` と `rowgroup` だけである。列を持たないものを中に置くと、
     読み上げは表として辿れなくなる。 */
  it('表の直の子は、行だけにする', () => {
    draw({
      overview: overview({
        mainline: [node('head0123456789'), node('p1'), node('p2'), node('base0123456789')],
        mainline_truncated: true,
        conflicts: [{ a: 'feature', b: 'other', n: 2, files: ['a.ts', 'b.ts'] }],
      }),
    });
    const pane = document.querySelector('#git-rows');

    expect([...(pane?.children ?? [])].map((child) => child.getAttribute('role'))).toEqual(
      Array.from({ length: pane?.children.length ?? 0 }, () => 'row'),
    );
  });

  it('コンフリクトの見込みは、表の外に置く', () => {
    draw({
      overview: overview({
        conflicts: [{ a: 'feature', b: 'other', n: 2, files: ['a.ts', 'b.ts'] }],
      }),
    });

    expect(document.querySelector('.git-conflicts'), '見込みそのものが消えている').not.toBeNull();
    expect(document.querySelector('#git-rows .git-conflicts')).toBeNull();
  });

  /* 折り畳んだ行も、読んでいないことを言う行も、押せないだけで表の行である。 */
  it('折り畳んだ行と、読んでいないことを言う行も、同じ数のセルを持つ', () => {
    draw({
      overview: overview({
        mainline: [node('head0123456789'), node('p1'), node('p2'), node('base0123456789')],
        mainline_truncated: true,
      }),
    });

    expect(cellsOf(rowOf('2 commits'))).toHaveLength(5);
    expect(cellsOf(rowOf('older commits are not read'))).toHaveLength(5);
  });
});
