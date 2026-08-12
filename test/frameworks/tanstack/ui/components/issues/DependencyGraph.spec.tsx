import { render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import {
  DependencyGraph,
  type DependencyGraphProps,
} from '~/frameworks/tanstack/ui/components/issues/DependencyGraph.tsx';
import { buildWorkJoin, type GitReach } from '~/frameworks/tanstack/ui/derive/workJoin.ts';

/* 依存グラフのカードが出す、ブランチのチップ。

   カードは 2 行しか無いので、ブランチについて言うのは遅れと衝突だけである。だから
   **手元の git を読めていないカードは、遅れても衝突してもいないカードと同じ絵になる** ——
   ここが潰れると、読めなかったことが「問題なし」として画面に出る。 */

vi.mock('~/frameworks/tanstack/ui/nav/NavContext.tsx', () => ({
  useNav: () => ({ openIssue: vi.fn(), openRef: vi.fn(), gotoIssues: vi.fn() }),
}));

type Issue = DependencyGraphProps['issues'][number];

const pull = (head: string | null, state = 'OPEN') => ({
  number: 7,
  state,
  is_draft: false,
  review_decision: null,
  head_ref_name: head,
});

const issue = (id: string, pulls: ReturnType<typeof pull>[]): Issue => ({
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
    pull_requests: pulls,
    comments: 0,
    reactions: 0,
  },
});

const tip = (name: string, behind: number) => ({
  name,
  kind: 'branch',
  ahead: 0,
  behind,
  worktree: null,
});

const draw = (issues: readonly Issue[], reach: GitReach, tips: ReturnType<typeof tip>[] = []) =>
  render(
    <DependencyGraph
      issues={issues}
      workers={new Map()}
      onOpen={vi.fn()}
      join={buildWorkJoin(
        tips.length === 0 ? null : ({ tips, conflicts: [] } as never),
        reach,
        issues,
      )}
    />,
  ).container;

const withPull = issue('#1', [pull('feat/x')]);

describe('カードのブランチのチップ', () => {
  it('観測できていれば、遅れている数を出す', () => {
    const chip = draw([withPull], 'observed', [tip('feat/x', 3)]).querySelector('.dg-node .dg-br');

    expect(chip?.classList.contains('unread')).toBe(false);
    expect(chip?.textContent).toContain('3');
  });

  it.each([
    ['unobservable', '?'],
    ['pending', '—'],
  ] as const)('%s なら、数の代わりに %s を出す', (reach, mark) => {
    const chip = draw([withPull], reach).querySelector('.dg-node .dg-br');

    expect(chip?.classList.contains('unread'), '読めていないことがカードから消える').toBe(true);
    expect(chip?.textContent).toContain(mark);
  });

  /* 観測できていて遅れも衝突も無いカードは、素で何も出さない。そこに `?` が出ると、
     読めなかったことではなく、遅れていないことを言うチップになってしまう */
  it('観測できていて遅れも衝突も無ければ、何も出さない', () => {
    expect(draw([withPull], 'observed', [tip('feat/x', 0)]).querySelector('.dg-node .dg-br')).toBe(
      null,
    );
  });

  /* 閉じた PR のブランチは、たいてい手元にも残っていない。ここに出すと、片付いた課題の
     カードが読めなかったことを言うチップで埋まる */
  it('閉じた PR しか持たない課題には、読めなくても何も出さない', () => {
    const closed = issue('#2', [pull('feat/gone', 'MERGED')]);

    expect(draw([closed], 'unobservable').querySelector('.dg-node .dg-br')).toBe(null);
  });
});
