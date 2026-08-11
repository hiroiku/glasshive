import { describe, expect, it } from 'vitest';
import {
  type ConcurrencyNode,
  concurrency,
  unobservableConcurrency,
} from '~/frameworks/tanstack/ui/derive/concurrency.ts';

/* 同時に動いていたエージェントの数。

   **同じエージェントの稼働区間が同じ足に何本重なっても 1 と数える。** 数えないと、
   細かく途切れながら働いた 1 つのエージェントが数十に見える。 */

const FOOT = 60_000;
const FROM = 0;
const NOW = 5 * FOOT;

const iso = (ms: number) => new Date(ms).toISOString();

const node = (
  intervals: readonly (readonly [number, number])[],
  state = 'ended',
  over: Partial<ConcurrencyNode> = {},
): ConcurrencyNode => ({
  state,
  started: iso(0),
  last_activity: iso(NOW),
  intervals: intervals.map(([from, to]) => [iso(from), iso(to)]),
  intervals_state: 'observed',
  ...over,
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
    const broken = node([], 'ended', { intervals: [['いつか', 'そのうち']] });

    expect(concurrency([broken], FROM, FOOT, 3, NOW)).toEqual([0, 0, 0]);
  });
});

/* 稼働を観測できなかったエージェントは、動いていた数にも静かだった数にも入れられない。
 **足すのでも落とすのでもなく、別の数として返す。** */
describe('稼働を観測できなかったエージェントの数', () => {
  const unread = (over: Partial<ConcurrencyNode> = {}) =>
    node([], 'ended', { intervals_state: 'unobservable', ...over });

  it('動いていた数には入れない', () => {
    const counts = concurrency([unread()], FROM, FOOT, 3, NOW);

    expect(counts, '読めなかったことが、動いていたことになっている').toEqual([0, 0, 0]);
  });

  it('起点から最後の動きまでの足を、分からない数として数える', () => {
    const counts = unobservableConcurrency(
      [unread({ started: iso(0), last_activity: iso(2 * FOOT) })],
      FROM,
      FOOT,
      5,
      NOW,
    );

    expect(counts, '読めなかったことが、静かだったことになっている').toEqual([1, 1, 1, 0, 0]);
  });

  it('静かだったと分かっているエージェントは数えない', () => {
    const quiet = node([], 'ended', { intervals_state: 'absent' });

    expect(unobservableConcurrency([quiet], FROM, FOOT, 3, NOW)).toEqual([0, 0, 0]);
  });

  /* 一部でも読めていれば、その分は `concurrency` が数える。両方で数えると 1 人が 2 人に見える。 */
  it('稼働区間が 1 本でも読めていれば、分からない数には入れない', () => {
    const partial = node([[0, FOOT]], 'ended', { intervals_state: 'unobservable' });

    expect(unobservableConcurrency([partial], FROM, FOOT, 3, NOW)).toEqual([0, 0, 0]);
    expect(concurrency([partial], FROM, FOOT, 3, NOW)).toEqual([1, 1, 0]);
  });

  it('対象期間の外なら数えない', () => {
    const old = unread({ started: iso(-10 * FOOT), last_activity: iso(-5 * FOOT) });

    expect(unobservableConcurrency([old], FROM, FOOT, 3, NOW)).toEqual([0, 0, 0]);
  });

  it('時刻として読めなければ数えない', () => {
    const broken = unread({ started: 'いつか', last_activity: 'そのうち' });

    expect(unobservableConcurrency([broken], FROM, FOOT, 3, NOW)).toEqual([0, 0, 0]);
  });

  /* 起点が時刻として読めないだけの行は、最後の動きで数える。`intervalsOf` は同じ落とし方を
     するので、片方だけが落とすと、そのエージェントが画面から黙って消える。 */
  it('起点が時刻として読めなければ、最後の動きで数える', () => {
    const broken = unread({ started: 'いつか', last_activity: iso(FOOT) });

    expect(
      unobservableConcurrency([broken], FROM, FOOT, 5, NOW),
      '起点が読めないだけで、読めなかったエージェントが数から落ちている',
    ).toEqual([0, 1, 0, 0, 0]);
  });
});
