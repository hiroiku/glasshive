import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { StatsObservation } from '~/frameworks/tanstack/ui/components/stats/StatsObservation.tsx';
import { WindowsPanel } from '~/frameworks/tanstack/ui/components/stats/WindowsPanel.tsx';
import { QUOTA_WINDOW_MS } from '~/frameworks/tanstack/ui/derive/timeWindow.ts';

/* 利用枠の期間と、週ぶんの合計と、内訳。

   **観測できなかったことを `idle` と 0 で表さない。** どちらも「枠を 1 つも使って
   いなかった」という断定で、`transcript` を開けなかったこととは別の事実である。 */

const NOW = Date.parse('2026-08-09T12:34:56.000Z');

const draw = (observation: StatsObservation = { kind: 'observed' }, active = true) =>
  render(
    <WindowsPanel
      quota={{ active, tokens: 1500, endsAtMs: NOW + QUOTA_WINDOW_MS }}
      weekTokens={7000}
      totals={{ total: 1500, input: 900, output: 400, cacheWrite: 200, cacheRead: 3000 }}
      nowMs={NOW}
      observation={observation}
    />,
  );

describe('観測できた利用枠', () => {
  it('開いている期間と週ぶんの合計を出す', () => {
    const { container } = draw();

    expect(container.textContent).toContain('1.5k');
    expect(container.textContent).toContain('7.0k');
  });

  it('読んで何も無かったなら、枠が開いていないと言ってよい', () => {
    const { container } = draw({ kind: 'absent' }, false);

    expect(container.textContent).toContain('idle — next prompt opens a window');
  });
});

describe('観測できていないときの利用枠', () => {
  it('観測できなかったことを `idle` と言わない', () => {
    const { container } = draw({ kind: 'unobservable', reason: 'transcript.unreadable' }, false);

    expect(
      container.textContent,
      '`idle` は「枠を 1 つも使っていなかった」という断定である',
    ).not.toContain('idle');
    expect(container.querySelector('.sf-wtable'), '0 の並ぶ表を出さない').toBeNull();
    expect(container.querySelector('.sf-note')?.getAttribute('title')).toBe(
      'Could not be read — transcript.unreadable',
    );
  });

  it('まだ答えが来ていないなら、合計に `0` を出さない', () => {
    const { container } = draw({ kind: 'pending' });

    expect(container.querySelector('.sf-wtable')).toBeNull();
    expect(container.querySelector('.sf-note')?.textContent).toBe('reading…');
  });
});
