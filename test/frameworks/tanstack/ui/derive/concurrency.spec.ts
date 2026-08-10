import { describe, expect, it } from 'vitest';
import { type ConcurrencyNode, concurrency } from '~/frameworks/tanstack/ui/derive/concurrency.ts';

/* 同時に動いていたエージェントの数。

   **同じエージェントの稼働区間が同じ足に何本重なっても 1 と数える。** 数えないと、
   細かく途切れながら働いた 1 つのエージェントが数十に見える。 */

const FOOT = 60_000;
const FROM = 0;
const NOW = 5 * FOOT;

const node = (
  intervals: readonly (readonly [number, number])[],
  state = 'ended',
): ConcurrencyNode => ({
  state,
  intervals: intervals.map(([from, to]) => [
    new Date(from).toISOString(),
    new Date(to).toISOString(),
  ]),
});

describe('同時に動いていたエージェントの数', () => {
  it('稼働区間が掛かる足を 1 ずつ数える', () => {
    const counts = concurrency([node([[0, 2 * FOOT]])], FROM, FOOT, 5, NOW);

    expect(counts).toEqual([1, 1, 1, 0, 0]);
  });

  it('エージェントが増えれば数も増える', () => {
    const counts = concurrency([node([[0, FOOT]]), node([[0, FOOT]])], FROM, FOOT, 5, NOW);

    expect(counts[0]).toBe(2);
  });

  /* 途切れながら働いた 1 つのエージェントを、その回数だけ数えると嘘になる。 */
  it('同じエージェントの稼働区間が同じ足に重なっても 1 と数える', () => {
    const counts = concurrency(
      [
        node([
          [0, 10_000],
          [20_000, 30_000],
          [40_000, 50_000],
        ]),
      ],
      FROM,
      FOOT,
      5,
      NOW,
    );

    expect(counts[0]).toBe(1);
  });

  it('動いている最後の稼働区間は現在まで伸ばす', () => {
    const counts = concurrency([node([[0, FOOT]], 'active')], FROM, FOOT, 5, NOW);

    expect(counts, 'いま働いているエージェントが、途中で数から消えている').toEqual([1, 1, 1, 1, 1]);
  });

  it('対象期間の外の稼働区間は数えない', () => {
    const counts = concurrency([node([[-10 * FOOT, -5 * FOOT]])], FROM, FOOT, 5, NOW);

    expect(counts).toEqual([0, 0, 0, 0, 0]);
  });

  it('稼働区間が 1 本も無いエージェントは数えない', () => {
    expect(concurrency([node([])], FROM, FOOT, 3, NOW)).toEqual([0, 0, 0]);
  });

  it('時刻として読めない稼働区間は落とす', () => {
    const broken: ConcurrencyNode = { state: 'ended', intervals: [['いつか', 'そのうち']] };

    expect(concurrency([broken], FROM, FOOT, 3, NOW)).toEqual([0, 0, 0]);
  });
});
