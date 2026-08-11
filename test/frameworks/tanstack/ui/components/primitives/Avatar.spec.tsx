import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Avatar, AvatarStack } from '~/frameworks/tanstack/ui/components/primitives/Avatar.tsx';

/* 担当の顔が誰かを名乗るか。

   顔だけが置かれている欄がある。そこで名前を伏せると、読み上げは「assignees」と言ったあと
   黙り、**担当が居ないときの `—` と同じに聞こえる。** 居る人を居ないことにしないために、
   顔は名乗る。`title` は名前の代わりにならない —— 触って使う画面では出ない。 */

const actor = (login: string) => ({ login, avatar: null });

describe('担当の顔', () => {
  it('誰の顔かを名乗る', () => {
    const { container } = render(<Avatar actor={actor('octocat')} />);

    const face = container.querySelector('.av');
    expect(face?.getAttribute('aria-label')).toBe('octocat');
    expect(face?.getAttribute('aria-hidden'), '名乗るものを読み上げから外さない').toBeNull();
  });

  it('名前が隣に文字で並ぶ呼び出しでは、顔は黙る', () => {
    const { container } = render(<Avatar actor={actor('octocat')} decorative />);

    const face = container.querySelector('.av');
    expect(face?.getAttribute('aria-hidden'), '同じ名前を 2 回読ませない').toBe('true');
  });

  it('マウスで読むための `title` はそのまま残す', () => {
    const { container } = render(<Avatar actor={actor('octocat')} />);

    expect(container.querySelector('.av')?.getAttribute('title')).toBe('octocat');
  });
});

describe('担当が何人か居るときの重ね', () => {
  it('重ね全体で 1 つ名乗る', () => {
    const { container } = render(<AvatarStack actors={[actor('alice'), actor('bob')]} max={3} />);

    const stack = container.querySelector('.av-stack');
    expect(stack?.getAttribute('role')).toBe('img');
    expect(stack?.getAttribute('aria-label')).toBe('alice, bob');
  });

  /* `+2` としか読まれないと、溢れた人は画面から消えたのと同じになる。 */
  it('`max` で溢れた人も名乗る', () => {
    const { container } = render(
      <AvatarStack actors={[actor('alice'), actor('bob'), actor('carol')]} max={1} />,
    );

    expect(container.querySelector('.av-stack')?.getAttribute('aria-label')).toBe(
      'alice, bob, carol',
    );
    expect(container.textContent, '目に見える数はそのまま').toContain('+2');
  });

  it('中の顔は重ねの名前に譲る', () => {
    const { container } = render(<AvatarStack actors={[actor('alice')]} max={3} />);

    expect(
      container.querySelector('.av')?.getAttribute('aria-hidden'),
      '重ねと中の顔で同じ名前を 2 回読ませない',
    ).toBe('true');
  });

  it('担当が居なければ、何も置かない', () => {
    const { container } = render(<AvatarStack actors={[]} max={3} />);

    expect(container.querySelector('.av-stack'), '居ないことを空の名前で言わない').toBeNull();
  });
});
