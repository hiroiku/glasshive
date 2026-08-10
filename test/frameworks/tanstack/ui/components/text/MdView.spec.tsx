import { render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { MdView } from '~/frameworks/tanstack/ui/components/text/MdView.tsx';

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
      { id: 'glasshive-4f2a', status: 'open' },
      { id: 'glasshive-9b31', status: 'open' },
    ]),
    new Map(),
    new Map(),
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
      tips: [],
      conflicts: [],
    }),
  );
  return { useTokenIndex: () => dict };
});

const view = (text: string) => {
  const { container } = render(<MdView text={text} project={undefined} />);
  return container;
};

describe('会話の本文のチップ', () => {
  it('地の文の id は枠付きのチップになる', () => {
    const container = view('直したのは glasshive-4f2a です');

    expect(container.querySelectorAll('.ichip')).toHaveLength(1);
  });

  it('地の文の略記は正式な id に伸ばす', () => {
    const container = view('直したのは 4f2a です');

    expect(container.querySelector('.ichip')?.textContent).toContain('glasshive-4f2a');
  });

  it('インラインコードの中もチップになる', () => {
    const container = view('`.worktrees/glasshive-4f2a` で直した');

    expect(container.querySelectorAll('code .tokref'), '引用の中でも押せる').toHaveLength(1);
  });

  it('引用の中は書かれたとおりに残る', () => {
    const container = view('`.worktrees/glasshive-4f2a` で直した');

    expect(container.querySelector('code')?.textContent).toBe('.worktrees/glasshive-4f2a');
  });

  /* 引用の中で略記を伸ばすと、そこに書かれていない文字列が現れる。 */
  it('引用の中の略記は伸ばさず、指す先だけ正式な id で持つ', () => {
    const container = view('`bd show 4f2a` を叩いた');

    const chip = container.querySelector<HTMLElement>('code .tokref');
    expect(container.querySelector('code')?.textContent).toBe('bd show 4f2a');
    expect(chip?.dataset.issue).toBe('glasshive-4f2a');
  });

  /* チップが自前の余白と背景を持つと、等幅の一続きの中で枠を突き破る。 */
  it('引用の中のチップは、枠付きのチップの姿を持たない', () => {
    const container = view('`glasshive-4f2a` を見た');

    const chip = container.querySelector('code .tokref');
    expect(chip?.classList.contains('ichip')).toBe(false);
    expect(container.querySelectorAll('code .ichip')).toHaveLength(0);
  });

  it('コードブロックの中もチップになる', () => {
    const container = view('```\ngit worktree add .worktrees/glasshive-4f2a\n```');

    expect(container.querySelectorAll('pre .tokref')).toHaveLength(1);
    expect(container.querySelector('pre')?.textContent).toContain('.worktrees/glasshive-4f2a');
  });

  it('引用を抜けたら、また枠付きのチップになる', () => {
    const container = view('`glasshive-4f2a` を見て、glasshive-4f2a を直した');

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
