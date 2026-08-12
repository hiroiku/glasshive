import { render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { MdView } from '~/frameworks/tanstack/ui/components/text/MdView.tsx';
import type { MarkdownSource } from '~/frameworks/tanstack/ui/markdown.ts';

/* 会話の本文に出てくる既知の id はチップになる。**引用の中でもチップになる。**

   `code` と `pre` は書かれたとおりに出す場所なので、そこでは文字列を差し替えず、
   背景も枠も持たない姿で出す — 余白と背景を持つチップを等幅の一続きに置くと、
   枠を突き破って隣の行に重なる。引用の外では今までどおり枠付きのチップにする。 */

vi.mock('~/frameworks/tanstack/ui/nav/NavContext.tsx', () => ({
  useNav: () => ({
    openIssue: vi.fn(),
    openConv: vi.fn(),
    openRef: vi.fn(),
    gotoBranch: vi.fn(),
  }),
}));

/* インデックスは本物の実装から組む。写して持つと、実装が変わったときに
   ここだけ古い形のまま緑になる。 */
vi.mock('~/frameworks/tanstack/ui/hooks/useTokenIndex.ts', async () => {
  const { commitTokens, issueIndex, tokenDict } = await import(
    '~/frameworks/tanstack/ui/derive/tokens.ts'
  );
  const dict = tokenDict(
    issueIndex([
      { id: '#209', status: 'open' },
      { id: '#131', status: 'open' },
    ]),
    new Map(),
    new Map([['glasshive-2dt', 'worktree' as const]]),
    commitTokens({
      state: 'observed',
      reason: null,
      base: 'main',
      worktrees: [],
      branches: [],
      mainline: [
        {
          sha: '7f3473bcc1d2e3f4a5b6c7d8e9f0a1b2c3d4e5f6',
          merge: false,
          date: '2026-08-09T12:00:00Z',
          subject: '辞書で引く',
        },
      ],
      mainline_truncated: false,
      tips: [],
      conflicts: [],
    }),
  );
  return { useTokenIndex: () => dict };
});

const view = (text: string, source: MarkdownSource = 'transcript') => {
  const { container } = render(<MdView text={text} source={source} project={undefined} />);
  return container;
};

describe('会話の本文のチップ', () => {
  it('地の文の id は枠付きのチップになる', () => {
    const container = view('直したのは #209 です');

    expect(container.querySelectorAll('.ichip')).toHaveLength(1);
  });

  /* 番号だけでチップにすると、文中のただの数が押せるものに見える。 */
  it('`#` の付かない番号はチップにしない', () => {
    const container = view('直したのは 209 件です');

    expect(container.querySelectorAll('.ichip')).toHaveLength(0);
  });

  it('インラインコードの中もチップになる', () => {
    const container = view('`.worktrees/glasshive-2dt` で直した');

    expect(container.querySelectorAll('code .tokref'), '引用の中でも押せる').toHaveLength(1);
  });

  it('引用の中は書かれたとおりに残る', () => {
    const container = view('`.worktrees/glasshive-2dt` で直した');

    expect(container.querySelector('code')?.textContent).toBe('.worktrees/glasshive-2dt');
  });

  /* 引用の中で文字列を差し替えると、そこに書かれていないものが現れる。 */
  it('引用の中は書き換えず、指す先だけ id で持つ', () => {
    const container = view('`gh issue view #209` を叩いた');

    const chip = container.querySelector<HTMLElement>('code .tokref');
    expect(container.querySelector('code')?.textContent).toBe('gh issue view #209');
    expect(chip?.dataset.issue).toBe('#209');
  });

  /* チップが自前の余白と背景を持つと、等幅の一続きの中で枠を突き破る。 */
  it('引用の中のチップは、枠付きのチップの姿を持たない', () => {
    const container = view('`#209` を見た');

    const chip = container.querySelector('code .tokref');
    expect(chip?.classList.contains('ichip')).toBe(false);
    expect(container.querySelectorAll('code .ichip')).toHaveLength(0);
  });

  it('コードブロックの中もチップになる', () => {
    const container = view('```\ngit worktree add .worktrees/glasshive-2dt\n```');

    expect(container.querySelectorAll('pre .tokref')).toHaveLength(1);
    expect(container.querySelector('pre')?.textContent).toContain('.worktrees/glasshive-2dt');
  });

  it('引用を抜けたら、また枠付きのチップになる', () => {
    const container = view('`#209` を見て、#209 を直した');

    expect(container.querySelectorAll('code .tokref'), '引用の中は書かれたまま').toHaveLength(1);
    expect(container.querySelectorAll('.ichip'), '引用の外は枠付きのチップ').toHaveLength(1);
  });

  /* `git` の API が返す sha は 40 桁だが、文に書かれるのは 7 桁である。 */
  it('略した sha も、書かれた桁のままチップになる', () => {
    const container = view('`git show 7f3473b` で読める');

    const chip = container.querySelector<HTMLElement>('code .tokref');
    expect(chip?.textContent).toBe('7f3473b');
    expect(chip?.dataset.rev).toBe('7f3473bcc1d2e3f4a5b6c7d8e9f0a1b2c3d4e5f6');
  });

  it('地の文の sha は枠付きのチップになる', () => {
    const container = view('7f3473b で直した');

    expect(container.querySelector('.refchip.commit')?.textContent).toContain('7f3473b');
  });
});
