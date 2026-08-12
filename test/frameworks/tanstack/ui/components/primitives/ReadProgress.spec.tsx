import { act, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ReadProgress } from '~/frameworks/tanstack/ui/components/primitives/ReadProgress.tsx';

/* 読んでいる最中の表示。

   **分母を観測できているかどうかで、絵が変わる。** 1 往復で答えを受け取る画面には途中が
   存在しないので、そこで塗るバーの幅は観測した量ではなく見た目のための数になる。逆に、
   分母まで観測できているなら塗らない理由が無い。ここで見るのは、その 2 つが混ざらないことと、
   塗った幅が渡された数のとおりであることである。 */

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

/* 分母まで観測できているときだけ塗る。 */
describe('ReadProgress の観測した進み具合', () => {
  const scanning = (done: number, total: number) => (
    <ReadProgress
      label="Reading the conversation"
      scan={{ done, total, text: `${done} of ${total} KiB read` }}
    />
  );

  it('観測した割合のとおりに塗る', () => {
    const { container } = render(scanning(3, 4));
    const fill = container.querySelector('.rp-fill') as HTMLElement | null;

    expect(fill?.style.width, '塗る幅は渡された 2 つの数からしか決まらない').toBe('75%');
    expect(
      container.querySelector('[role="progressbar"]')?.getAttribute('aria-valuenow'),
      '目で読める幅と、読み上げに渡す割合を食い違わせない',
    ).toBe('75');
  });

  /* `aria-valuenow` は、どこからどこまでの中の値なのかが分からなければ割合にならない。
     両端を **添えないと、既定の 0〜100 に当たるかどうかは読み上げの側の裁量になる。** */
  it('割合を渡すときは、その両端も渡す', () => {
    const bar = render(scanning(3, 4)).container.querySelector('[role="progressbar"]');

    expect([bar?.getAttribute('aria-valuemin'), bar?.getAttribute('aria-valuemax')]).toEqual([
      '0',
      '100',
    ]);
  });

  /* 読み上げは数をそのまま読む。**丸めないと、割り切れない割合が延々と読み上げられる。** */
  it('割り切れない割合は、整数にして渡す', () => {
    const bar = render(scanning(1, 3)).container.querySelector('[role="progressbar"]');

    expect(bar?.getAttribute('aria-valuenow'), '「33.33333333333333 パーセント」と読まれる').toBe(
      '33',
    );
  });

  /* バーは走らせた読み取りの進み具合で、一覧が何割できたかではない。**何を数えているかを
     言わないと、90% のバーが一覧の 9 割として読まれる。** */
  it('何を数えているかを言う', () => {
    const { container } = render(scanning(3, 4));

    expect(container.querySelector('.rp-scan')?.textContent).toBe('3 of 4 KiB read');
    expect(
      container.querySelector('[role="progressbar"]')?.getAttribute('aria-valuetext'),
      '読み上げに裸の 75% だけを渡すと、何の 75% なのかが分からない',
    ).toBe('3 of 4 KiB read');
  });

  /* 分母を観測する前に塗ると、そこに在るのは割合ではない。**輪郭だけのバーに戻す** ——
     0% を塗ると、読み取りが始まっていないことと、始まって何も読めていないことが同じ絵になる。 */
  it('分母を観測できていなければ、塗らずに数も出さない', () => {
    const { container } = render(scanning(0, 0));

    expect(container.querySelector('.rp-fill'), '分母の無い割合は割合ではない').toBeNull();
    expect(container.querySelector('.rp-scan'), '幅を持たないバーの下に数を置かない').toBeNull();
    expect(
      container.querySelector('[role="progressbar"]')?.getAttribute('aria-valuenow'),
      '観測していない割合を、読み上げの側にだけ渡さない',
    ).toBeNull();
  });

  /* 読める量が総量を超えることは無いが、`transcript` は読んでいるあいだにも伸びる。
   **伸びたぶんで 100% を超えさせない** —— バーが枠から出るより先に、数が量でなくなる。 */
  it('総量を超えた読みは、総量で止める', () => {
    const { container } = render(scanning(9, 4));

    expect(
      (container.querySelector('.rp-fill') as HTMLElement | null)?.style.width,
      '枠から出たバーより先に、その数が量でなくなる',
    ).toBe('100%');
  });

  it('塗るときは、走る光を止める', () => {
    const measured = render(scanning(1, 4)).container.querySelector('.rp-track');
    const plain = render(<ReadProgress label="Reading transcripts" />).container.querySelector(
      '.rp-track',
    );

    expect(
      measured?.className,
      '走る光と塗った幅が同じバーに出ると、どちらが進み具合なのか読めない',
    ).toContain('measured');
    expect(
      plain?.className,
      '分母の無いバーから光まで消すと、待っていることが何も残らない',
    ).not.toContain('measured');
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
