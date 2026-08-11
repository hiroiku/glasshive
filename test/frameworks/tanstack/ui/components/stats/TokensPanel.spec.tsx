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
      observation={{ kind: 'observed' }}
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

  /* 押されているかを色だけで言うと、読み上げにも、色の差を掴めない目にも届かない。
     `.fchip` を使うほかのツールバーと同じく `aria-pressed` で言う。 */
  it('押されているかを `aria-pressed` でも言う', () => {
    const { container } = draw({ window: QUOTA_WINDOW_MS });

    expect(chipOf(container, '5h').getAttribute('aria-pressed')).toBe('true');
    expect(chipOf(container, 'Auto').getAttribute('aria-pressed')).toBe('false');
    expect(chipOf(container, '7d').getAttribute('aria-pressed')).toBe('false');
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

/* 消費をどこまで観測できたか。**平らな 0 のグラフは「使っていなかった」という断定である。**

   まだ答えが来ていないのと、読んで何も無かったのと、`transcript` を開けなかったのは
   別の事実で、同じ絵にしてはいけない。 */
describe('観測できていないときの消費', () => {
  it('まだ答えが来ていないなら、合計に `0` を出さない', () => {
    const { container } = draw({ observation: { kind: 'pending' } });

    expect(container.querySelector('.sf-big')?.textContent).toBe('—');
    expect(container.querySelector('.sf-big')?.getAttribute('title')).toBe('Not read yet');
  });

  it('観測できなかったなら、平らな 0 のグラフを描かない', () => {
    const { container } = draw({
      observation: { kind: 'unobservable', reason: 'transcript.unreadable' },
    });

    expect(container.querySelector('svg'), '空のグラフは「静かだった」に見える').toBeNull();
    expect(container.querySelector('.sf-big')?.textContent).toBe('?');
  });

  it('観測できなかった理由を、指せば読めるようにする', () => {
    const { container } = draw({
      observation: { kind: 'unobservable', reason: 'transcript.unreadable' },
    });

    const note = container.querySelector('.sf-note');
    expect(note?.textContent).toBe('could not be read');
    expect(note?.getAttribute('title'), 'エラーコードで調べられるようにする').toBe(
      'Could not be read — transcript.unreadable',
    );
  });

  it('読んで何も無かったなら、`0` を出してよい', () => {
    const { container } = draw({ observation: { kind: 'absent' } });

    expect(
      container.querySelector('.sf-big')?.textContent,
      '観測できたうえで無かったのだから、0 はこのプロジェクトについての事実である',
    ).toBe('0');
    expect(container.querySelector('svg')).not.toBeNull();
  });

  it('観測できていないところにホバーしても、内訳を出さない', () => {
    const hover = (container: HTMLElement) => {
      const plot = container.querySelector('.sf-plot');
      if (plot === null) throw new Error('no plot');
      fireEvent.mouseMove(plot, { clientX: 10 });
      return container.querySelector('.sf-tip');
    };

    // 観測できていれば出る。出ないことだけを見ると、ホバーが壊れても通ってしまう
    expect(hover(draw().container)).not.toBeNull();
    expect(
      hover(draw({ observation: { kind: 'unobservable', reason: null } }).container),
      '観測していない内訳を出す先が無い',
    ).toBeNull();
  });
});
