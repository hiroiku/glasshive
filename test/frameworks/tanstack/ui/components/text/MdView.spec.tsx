import { render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { MdView } from '~/frameworks/tanstack/ui/components/text/MdView.tsx';

/* 会話の本文に出てくる既知の id は札に置き換わる。**ただし引用の中は別である。**

   `code` と `pre` は書かれたとおりに出す場所で、読み手はそこの字を見に来ている。
   道や命令の途中に課題の id が挟まっていても差し替えると、引用が引用でなくなる。
   見た目にも壊れる — 札は自前の余白と地色を持つので、等幅の一続きの中に置くと
   枠を突き破って隣の行に重なる。 */

vi.mock('~/frameworks/tanstack/ui/nav/NavContext.tsx', () => ({
  useNav: () => ({ openIssue: vi.fn(), openConv: vi.fn(), gotoGit: vi.fn() }),
}));

vi.mock('~/frameworks/tanstack/ui/hooks/useTokenIndex.ts', () => ({
  useTokenIndex: () => ({
    issues: new Map([['glasshive-9t7', { id: 'glasshive-9t7', closed: false }]]),
    agents: new Map(),
    gits: new Map(),
  }),
}));

const view = (text: string) => {
  const { container } = render(<MdView text={text} project={undefined} />);
  return container;
};

describe('会話の本文の札', () => {
  it('地の文の id は札になる', () => {
    const container = view('直したのは glasshive-9t7 です');

    expect(container.querySelectorAll('a.ichip')).toHaveLength(1);
  });

  it('インラインコードの中は札にしない', () => {
    const container = view('`.worktrees/glasshive-9t7` で直した');

    expect(container.querySelectorAll('code a.ichip'), '引用の中に札は入らない').toHaveLength(0);
    expect(container.querySelector('code')?.textContent, '書かれたとおりに残る').toBe(
      '.worktrees/glasshive-9t7',
    );
  });

  it('コードブロックの中も札にしない', () => {
    const container = view('```\ngit worktree add .worktrees/glasshive-9t7\n```');

    expect(container.querySelectorAll('pre a.ichip')).toHaveLength(0);
    expect(container.querySelector('pre')?.textContent).toContain('.worktrees/glasshive-9t7');
  });

  it('引用を抜けたら、また札になる', () => {
    const container = view('`glasshive-9t7` を見て、glasshive-9t7 を直した');

    expect(container.querySelectorAll('code a.ichip'), '引用の中は素のまま').toHaveLength(0);
    expect(container.querySelectorAll('a.ichip'), '引用の外は札に戻る').toHaveLength(1);
  });
});
