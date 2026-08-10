import { fireEvent, render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import {
  TokensPanel,
  type TokensPanelProps,
} from '~/frameworks/tanstack/ui/components/stats/TokensPanel.tsx';
import {
  DAY_MS,
  MAX_WINDOW_MS,
  QUOTA_WINDOW_MS,
  WINDOWS,
} from '~/frameworks/tanstack/ui/derive/timeWindow.ts';
import { footFor } from '~/frameworks/tanstack/ui/derive/usage.ts';

/* 一度に見る幅。**選択肢はウォーターフォールと同じでなければならない** ——
   同じ時間軸の上に在るものを別の刻みで選ばせると、片方で掴んだ感覚がもう片方で通じない。

   足(ローソク足 1 本の長さ)は幅から決まる。押して選ぶものではないので、いま何分の足で
   見ているかは読めるだけでよい。 */

const NOW = Date.parse('2026-08-09T12:34:56.000Z');
const FOOT_MS = 15 * 60_000;
const BARS = 4;

const draw = (over: Partial<TokensPanelProps> = {}) =>
  render(
    <TokensPanel
      bins={Array.from({ length: BARS }, () => ({
        total: 0,
        input: 0,
        output: 0,
        cacheWrite: 0,
        cacheRead: 0,
      }))}
      fromMs={NOW - BARS * FOOT_MS}
      footMs={FOOT_MS}
      bars={BARS}
      window="auto"
      nowMs={NOW}
      onWindow={() => undefined}
      {...over}
    />,
  );

const chipOf = (container: HTMLElement, label: string): HTMLButtonElement => {
  const found = [...container.querySelectorAll('button')].find(
    (button) => button.textContent === label,
  );
  if (found === undefined) throw new Error(`no chip labelled ${label}`);
  return found;
};

describe('幅のチップ', () => {
  it('共有の語彙をそのまま並べる', () => {
    const { container } = draw();
    const labels = [...container.querySelectorAll('.sf-h button')].map(
      (button) => button.textContent,
    );

    expect(labels, 'ここだけ別の刻みを持つと、2 つの画面で同じものが選べなくなる').toEqual(
      WINDOWS.map((preset) => preset.label),
    );
  });

  it('選ばれている幅だけが押されている', () => {
    const { container } = draw({ window: QUOTA_WINDOW_MS });

    expect(chipOf(container, '5h').classList.contains('on')).toBe(true);
    expect(chipOf(container, 'Auto').classList.contains('on')).toBe(false);
    expect(chipOf(container, '7d').classList.contains('on')).toBe(false);
  });

  it('押すと、その幅を渡す', () => {
    const onWindow = vi.fn();
    const { container } = draw({ onWindow });

    fireEvent.click(chipOf(container, '1d'));
    fireEvent.click(chipOf(container, 'Auto'));

    expect(onWindow).toHaveBeenNthCalledWith(1, DAY_MS);
    expect(onWindow).toHaveBeenNthCalledWith(2, 'auto');
  });
});

describe('いま何を見ているか', () => {
  it('足 × 本数を出す。足は選べないので、読めなければどの粗さかが分からない', () => {
    const footMs = footFor(MAX_WINDOW_MS);
    const { container } = draw({ footMs, bars: 42, window: MAX_WINDOW_MS });

    expect(container.querySelector('.sf-dim')?.textContent).toContain('4h × 42');
  });
});
