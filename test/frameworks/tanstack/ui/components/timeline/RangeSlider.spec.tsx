import { fireEvent, render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import {
  RangeSlider,
  TimeInput,
} from '~/frameworks/tanstack/ui/components/timeline/RangeSlider.tsx';

/* 時間帯を選ぶスライダー。

   **マウスで届く場所には、キーボードでも届かなければならない。** トラックの端までは
   ドラッグ 1 回で行けるのに、キーボードには行き先が無いと、広い範囲では端に着く前に
   何十回も押すことになる。 */

const NOW = Date.parse('2026-08-09T12:00:00Z');
const HOUR = 3_600_000;
const MIN_SPAN_MS = 60_000;

/** 全域は 24 時間、いま見ているのは真ん中の 2 時間 */
const DOMAIN = { min: NOW - 24 * HOUR, max: NOW };
const WINDOW = { a: NOW - 3 * HOUR, b: NOW - 1 * HOUR };

const mount = () => {
  const onChange = vi.fn();
  const { container } = render(
    <RangeSlider min={DOMAIN.min} max={DOMAIN.max} a={WINDOW.a} b={WINDOW.b} onChange={onChange} />,
  );
  const handles = [...container.querySelectorAll('.rs-handle')] as HTMLElement[];
  return { onChange, start: handles[0] as HTMLElement, end: handles[1] as HTMLElement };
};

/** 1 押しぶんの刻み。表示範囲の広さに合わせて決まる */
const STEP = Math.max(MIN_SPAN_MS, (WINDOW.b - WINDOW.a) / 20);

describe('端を、キーボードから全域の端まで送る', () => {
  it('Home は始まりを全域の左端まで送る', () => {
    const { onChange, start } = mount();

    fireEvent.keyDown(start, { key: 'Home' });

    expect(onChange, 'マウスはドラッグで届くのに、キーボードには行き先が無い').toHaveBeenCalledWith(
      DOMAIN.min,
      WINDOW.b,
    );
  });

  it('End は始まりを終わりの直前まで送る', () => {
    const { onChange, start } = mount();

    fireEvent.keyDown(start, { key: 'End' });

    expect(onChange, '両端が入れ替わってはいけない').toHaveBeenCalledWith(
      WINDOW.b - MIN_SPAN_MS,
      WINDOW.b,
    );
  });

  it('End は終わりを全域の右端まで送る', () => {
    const { onChange, end } = mount();

    fireEvent.keyDown(end, { key: 'End' });

    expect(onChange).toHaveBeenCalledWith(WINDOW.a, DOMAIN.max);
  });

  it('Home は終わりを始まりの直後まで送る', () => {
    const { onChange, end } = mount();

    fireEvent.keyDown(end, { key: 'Home' });

    expect(onChange).toHaveBeenCalledWith(WINDOW.a, WINDOW.a + MIN_SPAN_MS);
  });
});

describe('PageUp と PageDown は、矢印よりも大きく送る', () => {
  it('PageDown は始まりを 10 刻みぶん戻す', () => {
    const { onChange, start } = mount();

    fireEvent.keyDown(start, { key: 'PageDown' });

    expect(onChange).toHaveBeenCalledWith(WINDOW.a - STEP * 10, WINDOW.b);
  });

  it('PageUp は終わりを 10 刻みぶん進める', () => {
    const { onChange, end } = mount();

    fireEvent.keyDown(end, { key: 'PageUp' });

    expect(onChange).toHaveBeenCalledWith(WINDOW.a, WINDOW.b + STEP * 10);
  });
});

describe('矢印は 1 押しずつ動かす', () => {
  it('ArrowLeft は 1 刻みぶん戻す', () => {
    const { onChange, start } = mount();

    fireEvent.keyDown(start, { key: 'ArrowLeft' });

    expect(onChange).toHaveBeenCalledWith(WINDOW.a - STEP, WINDOW.b);
  });

  it('関わりの無いキーでは動かさない', () => {
    const { onChange, start } = mount();

    fireEvent.keyDown(start, { key: 'a' });

    expect(onChange).not.toHaveBeenCalled();
  });
});

/* 同じ形の欄が 2 つ並ぶので、名前が無いと、どちらの端かが読み上げから消える。 */
describe('時刻の欄は、自分がどの端かを名乗る', () => {
  it('渡された名前を読み上げに出す', () => {
    const { container } = render(<TimeInput value={NOW} label="Window start" onCommit={vi.fn()} />);

    expect(container.querySelector('.rs-time')?.getAttribute('aria-label')).toContain(
      'Window start',
    );
  });

  it('書式は名前の代わりにしない', () => {
    const { container } = render(<TimeInput value={NOW} label="Window end" onCommit={vi.fn()} />);
    const input = container.querySelector('.rs-time');

    expect(input?.getAttribute('aria-label')).not.toBe('YYYY-MM-DD HH:MM');
    expect(input?.getAttribute('title'), '書式そのものは、触れば見える形で残す').toBe(
      'YYYY-MM-DD HH:MM',
    );
  });
});
