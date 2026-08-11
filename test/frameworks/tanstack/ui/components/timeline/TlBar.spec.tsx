import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { TlBar } from '~/frameworks/tanstack/ui/components/timeline/TlBar.tsx';
import type { Axis, TimelineNode } from '~/frameworks/tanstack/ui/timeline/axis.ts';

/* 行 1 本ぶんの稼働区間のバー。

   **観測できなかった稼働を、棒として描いてはならない。** 棒は「この時間ずっと動いていた」と
   言い、ツールチップが所要時間まで添える。走査に失敗しただけの行にそれを描くと、
   何も観測していないところから、いちばん強い主張が出てくる。 */

const NOW = Date.parse('2026-08-09T12:00:00.000Z');
const at = (ms: number) => new Date(NOW - ms).toISOString();
const AXIS: Axis = { t0: NOW - 3_600_000, t1: NOW };

const node = (over: Partial<TimelineNode> = {}): TimelineNode => ({
  state: 'ended',
  started: at(1_800_000),
  last_activity: at(600_000),
  intervals: [],
  intervals_state: 'observed',
  ...over,
});

const draw = (over: Partial<TimelineNode> = {}, intervalsComplete = true) =>
  render(
    <TlBar
      node={node(over)}
      axis={AXIS}
      intervalsComplete={intervalsComplete}
      nowMs={NOW}
      onPanStart={() => undefined}
    />,
  );

const barsOf = (container: HTMLElement) => [...container.querySelectorAll('.bar')];

describe('稼働を観測できなかった行', () => {
  it('稼働の棒を 1 本も描かない', () => {
    const { container } = draw({ intervals_state: 'unobservable' });

    const solid = barsOf(container).filter((bar) => !bar.classList.contains('unknown'));

    expect(solid, '観測できなかったことが、稼働の棒として描かれている').toEqual([]);
  });

  /* 所要時間を書けるのは、その長さを観測できたときだけである。 */
  it('所要時間を言わない', () => {
    const { container } = draw({ intervals_state: 'unobservable' });

    for (const bar of barsOf(container))
      expect(bar.getAttribute('title') ?? '').not.toMatch(/\d+[smh]/);
  });

  it('読めなかったことを、細線とツールチップで言う', () => {
    const { container } = draw({ intervals_state: 'unobservable' });
    const bars = barsOf(container);

    expect(bars, '観測できなかった行が、何も無い行と同じに見えている').toHaveLength(1);
    expect(bars[0]?.className).toContain('unknown');
    expect(bars[0]?.getAttribute('title')).toContain('could not be read');
  });

  it('動いている行でも、明滅する棒にはしない', () => {
    const { container } = draw({ state: 'active', intervals_state: 'unobservable' });

    expect(container.querySelectorAll('.bar.active')).toHaveLength(0);
  });

  it('表示範囲の外なら、何も描かない', () => {
    const { container } = draw({
      intervals_state: 'unobservable',
      started: at(10 * 3_600_000),
      last_activity: at(9 * 3_600_000),
    });

    expect(barsOf(container)).toEqual([]);
  });
});

describe('稼働を観測できた行', () => {
  it('書かれている稼働区間を棒にする', () => {
    const { container } = draw({ intervals: [[at(1_800_000), at(600_000)]] });
    const bars = barsOf(container);

    expect(bars).toHaveLength(1);
    expect(bars[0]?.className).toContain('ended');
    expect(bars[0]?.getAttribute('title')).toContain('20m00s');
  });

  /* 稼働区間が無いだけの行を空にすると、行が画面から消える。 */
  it('稼働区間が無くても、起点と最後の動きで 1 本描く', () => {
    const { container } = draw({ intervals_state: 'absent' });

    expect(barsOf(container)).toHaveLength(1);
  });

  /* 読み取り範囲の手前は「在ったが濃さが分からない」であって、読めなかったのとは別の話である。 */
  it('読み取り範囲の手前は、密度不明の細線で示す', () => {
    const { container } = draw({ intervals: [[at(1_200_000), at(600_000)]] }, false);
    const hairline = container.querySelector('.bar.unknown');

    expect(hairline?.getAttribute('title')).toContain('density unknown');
  });
});
