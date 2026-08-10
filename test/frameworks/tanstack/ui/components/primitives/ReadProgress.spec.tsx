import { act, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ReadProgress } from '~/frameworks/tanstack/ui/components/primitives/ReadProgress.tsx';

/* 読んでいる最中の表示。

   **どこまで読めたかを、この画面は知らない。** いまはどの経路も 1 往復で結果を受け取るので、
   クライアントから見える途中が存在しない。それでもバーを塗ると、その幅は観測した量ではなく
   見た目のための数になる。ここで見るのは、割合を出す手段を持っていないことである。 */

describe('ReadProgress', () => {
  it('進み具合を主張しない', () => {
    const { container } = render(<ReadProgress label="Reading transcripts" />);

    expect(
      container.querySelector('.rp-fill'),
      '塗る要素が在れば、その幅は読めた量として読まれる',
    ).toBeNull();
    const bar = container.querySelector('[role="progressbar"]');
    expect(bar?.getAttribute('aria-valuenow'), '読み上げにだけ割合を渡さない').toBeNull();
  });

  it('いま何を読んでいるかを言う', () => {
    const { container } = render(<ReadProgress label="Fetching issues from GitHub" />);

    expect(container.textContent).toContain('Fetching issues from GitHub');
    expect(
      container.querySelector('[role="progressbar"]')?.getAttribute('aria-label'),
      '目で読める言葉と、読み上げに渡す言葉を食い違わせない',
    ).toBe('Fetching issues from GitHub');
  });

  it('割合の記号を出さない', () => {
    const { container } = render(<ReadProgress label="Reading transcripts" />);

    expect(
      container.textContent,
      '割合を持たないのに `%` が出れば、それは数の振りである',
    ).not.toContain('%');
  });
});

/* 遅いという判断は、時間が経ってからしかできない。 */
describe('ReadProgress の待たせている断り', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('すぐ終わるつもりのうちは、待たせていると言わない', () => {
    const { container } = render(
      <ReadProgress label="Reading transcripts" slowNote="This one is large" />,
    );

    expect(container.textContent, '最初から出すと、速いときにも遅いと言うことになる').not.toContain(
      'This one is large',
    );
  });

  it('長くかかっていれば、待たせていることに触れる', () => {
    const { container } = render(
      <ReadProgress label="Reading transcripts" slowNote="This one is large" />,
    );

    act(() => void vi.advanceTimersByTime(8000));

    expect(container.textContent).toContain('This one is large');
  });

  it('断りを渡さなければ、何も足さない', () => {
    const { container } = render(<ReadProgress label="Reading transcripts" />);

    act(() => void vi.advanceTimersByTime(60_000));

    expect(container.querySelector('.rp-note')).toBeNull();
  });
});
