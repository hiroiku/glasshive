import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { DirectoryPicker } from '~/frameworks/tanstack/ui/components/overview/DirectoryPicker.tsx';

/* 見つけたが、まだ観ると決めていないディレクトリ。

   **選ぶのは名前(id)で、パスではない。** 画面がパスを名指せると、開いているどのページも
   任意のディレクトリを glasshive に読ませられる。ここに並ぶのは、こちらが走査で
   見つけたものだけである。 */

const NOW = Date.parse('2026-08-09T12:00:00Z');

const candidate = (id: string, path: string | null = `/w/${id}`) => ({
  id,
  name: id,
  path,
  last_activity: '2026-08-09T11:00:00Z',
});

describe('観ると決めていないディレクトリの一覧', () => {
  it('見つけた数を見出しに出す', () => {
    render(
      <DirectoryPicker
        candidates={[candidate('a'), candidate('b')]}
        onWatch={() => undefined}
        open={false}
        nowMs={NOW}
      />,
    );

    expect(screen.getByText(/2 directories found/)).toBeTruthy();
  });

  it('押すと、その id を観ると決める', () => {
    const onWatch = vi.fn();
    render(<DirectoryPicker candidates={[candidate('a')]} onWatch={onWatch} open nowMs={NOW} />);

    fireEvent.click(screen.getByRole('button', { name: 'Watch' }));

    expect(onWatch, '画面が名指せるのは id だけである').toHaveBeenCalledWith('a');
  });

  /* 場所を読めなかったことを、場所が無いことと同じ顔で出さない。 */
  it('場所を読めていないものは、そう言う', () => {
    render(
      <DirectoryPicker
        candidates={[candidate('a', null)]}
        onWatch={() => undefined}
        open
        nowMs={NOW}
      />,
    );

    expect(screen.getByText('could not read where this is')).toBeTruthy();
  });

  /* 畳んだ見出しだけが残っても、押す先が無い。 */
  it('1 つも見つかっていなければ、何も出さない', () => {
    const { container } = render(
      <DirectoryPicker candidates={[]} onWatch={() => undefined} open nowMs={NOW} />,
    );

    expect(container.querySelector('.picker')).toBeNull();
  });

  /* まだ 1 つも観ていない画面では、ここから選ぶ以外にすることが無い。 */
  it('まだ何も観ていないときは、開いた状態で出す', () => {
    const { container } = render(
      <DirectoryPicker candidates={[candidate('a')]} onWatch={() => undefined} open nowMs={NOW} />,
    );

    expect(container.querySelector('details')?.hasAttribute('open')).toBe(true);
  });
});
