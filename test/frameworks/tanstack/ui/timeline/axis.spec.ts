import { describe, expect, it } from 'vitest';
import {
  axisOf,
  domainOf,
  formatTick,
  intervalsOf,
  niceTicks,
  parseTimeInput,
  type TimelineNode,
} from '~/frameworks/tanstack/ui/timeline/axis.ts';

/* 時間の軸。**ここが狂うと画面全体が嘘になる。**

   軸の取り方は「どの帯が読めるか」をそのまま決める。1 週間前に終わった
   セッションに軸を引き伸ばされると、いま動いている帯が 1 本の線に潰れる。 */

const NOW = Date.parse('2026-08-09T12:00:00.000Z');
const at = (ms: number) => new Date(NOW - ms).toISOString();

const node = (over: Partial<TimelineNode> = {}): TimelineNode => ({
  state: 'ended',
  started: at(3_600_000),
  last_activity: at(0),
  intervals: [],
  ...over,
});

describe('帯を数の組にする', () => {
  it('書かれている帯をそのまま数にする', () => {
    const intervals = intervalsOf(node({ intervals: [[at(3_600_000), at(1_800_000)]] }), NOW);

    expect(intervals).toEqual([[NOW - 3_600_000, NOW - 1_800_000]]);
  });

  /* 帯が 1 本も読めなかったエージェントを空にすると、画面から消える。 */
  it('帯が無ければ、起点と最後の動きで 1 本引く', () => {
    const intervals = intervalsOf(node({ started: at(600_000), last_activity: at(60_000) }), NOW);

    expect(intervals).toEqual([[NOW - 600_000, NOW - 60_000]]);
  });

  it('動いている最後の帯は現在まで伸ばす', () => {
    const intervals = intervalsOf(
      node({ state: 'active', intervals: [[at(600_000), at(300_000)]] }),
      NOW,
    );

    expect(intervals).toEqual([[NOW - 600_000, NOW]]);
  });

  it('時刻として読めない帯は落とす', () => {
    const intervals = intervalsOf(
      node({
        intervals: [
          ['いつか', 'そのうち'],
          [at(600_000), at(300_000)],
        ],
      }),
      NOW,
    );

    expect(intervals).toEqual([[NOW - 600_000, NOW - 300_000]]);
  });
});

describe('軸の両端を決める', () => {
  /* Auto は動いているものの実際の帯だけで決める。終わったものまで含めると、
     昔のセッションが軸を引き伸ばして、いまの帯が読めなくなる。 */
  it('Auto は、終わっていないものの帯だけで決める', () => {
    const axis = axisOf(
      [
        node({ state: 'ended', intervals: [[at(30 * 86_400_000), at(29 * 86_400_000)]] }),
        node({ state: 'waiting', intervals: [[at(600_000), at(300_000)]] }),
      ],
      'auto',
      NOW,
    );

    expect(axis.t0).toBe(NOW - 600_000);
    expect(axis.t1).toBe(NOW - 300_000);
  });

  it('全員終わっているときだけ、全行に広げる', () => {
    const axis = axisOf(
      [node({ state: 'ended', started: at(7_200_000), last_activity: at(3_600_000) })],
      'auto',
      NOW,
    );

    expect(axis.t0).toBe(NOW - 7_200_000);
    expect(axis.t1).toBe(NOW - 3_600_000);
  });

  it('Auto でも 24 時間より前へは遡らない', () => {
    const axis = axisOf(
      [node({ state: 'waiting', intervals: [[at(30 * 86_400_000), at(0)]] })],
      'auto',
      NOW,
    );

    expect(axis.t1 - axis.t0).toBe(24 * 3_600_000);
  });

  it('幅を決め打ちしたら、右端を最新に留めてその幅を取る', () => {
    const axis = axisOf(
      [node({ state: 'waiting', intervals: [[at(7_200_000), at(0)]] })],
      3_600_000,
      NOW,
    );

    expect(axis.t1).toBe(NOW);
    expect(axis.t1 - axis.t0).toBe(3_600_000);
  });

  it('動いているものが在れば、右端は現在まで伸びる', () => {
    const axis = axisOf(
      [node({ state: 'active', intervals: [[at(600_000), at(300_000)]] })],
      'auto',
      NOW,
    );

    expect(axis.t1).toBe(NOW);
  });

  it('何も無ければ、直前の 1 分を取る', () => {
    const axis = axisOf([], 'auto', NOW);

    expect(axis.t1 - axis.t0).toBe(60_000);
  });

  it('潰れた窓は 1 分まで広げる', () => {
    const axis = axisOf(
      [node({ state: 'waiting', intervals: [[at(1000), at(500)]] })],
      'auto',
      NOW,
    );

    expect(axis.t1 - axis.t0).toBeGreaterThanOrEqual(60_000);
  });
});

describe('動かせる全域', () => {
  it('最も古い起点から現在まで', () => {
    const domain = domainOf(
      [node({ started: at(7_200_000) }), node({ started: at(600_000) })],
      { t0: NOW - 600_000, t1: NOW },
      NOW,
    );

    expect(domain).toEqual({ t0: NOW - 7_200_000, t1: NOW });
  });

  it('いま見ている窓が全域より外なら、全域を広げる', () => {
    const domain = domainOf(
      [node({ started: at(600_000) })],
      { t0: NOW - 86_400_000, t1: NOW },
      NOW,
    );

    expect(domain.t0).toBe(NOW - 86_400_000);
  });
});

describe('目盛りを置く', () => {
  it('本数が 8 本を越えない刻みを選ぶ', () => {
    const ticks = niceTicks(NOW - 6 * 3_600_000, NOW);

    expect(ticks.length).toBeLessThanOrEqual(8);
    expect(ticks.length).toBeGreaterThan(0);
  });

  /* 相対の刻みだと「11:37」のような端数が並んで、時刻として読めない。 */
  it('キリの良い絶対時刻に置く', () => {
    const ticks = niceTicks(NOW - 6 * 3_600_000, NOW);

    for (const tick of ticks) {
      const date = new Date(tick);
      expect(date.getMinutes() % 30, `${date.toISOString()} が半端な時刻に置かれている`).toBe(0);
      expect(date.getSeconds()).toBe(0);
    }
  });

  it('窓が 1 日を跨ぐときだけ日付を添える', () => {
    expect(formatTick(NOW, 3_600_000)).not.toMatch(/\//);
    expect(formatTick(NOW, 2 * 86_400_000)).toMatch(/\//);
  });
});

describe('打ち込まれた日付を読む', () => {
  it('年月日と時分', () => {
    expect(parseTimeInput('2026-08-09 12:34', NOW)).toBe(new Date(2026, 7, 9, 12, 34).getTime());
  });

  it('年月日だけなら深夜', () => {
    expect(parseTimeInput('2026-08-09', NOW)).toBe(new Date(2026, 7, 9, 0, 0).getTime());
  });

  it('時分だけなら、日付は今の値を引き継ぐ', () => {
    const base = new Date(2026, 7, 9, 3, 0).getTime();

    expect(parseTimeInput('21:15', base)).toBe(new Date(2026, 7, 9, 21, 15).getTime());
  });

  /* 読めない字を当てずっぽうの時刻にすると、窓が思わぬところへ飛ぶ。 */
  it('読めない字は読めないと言う', () => {
    expect(parseTimeInput('きのう', NOW)).toBeNull();
    expect(parseTimeInput('', NOW)).toBeNull();
  });
});
