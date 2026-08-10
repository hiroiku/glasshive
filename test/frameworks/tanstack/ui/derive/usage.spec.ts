import { describe, expect, it } from 'vitest';
import {
  binUsage,
  byModel,
  gridOf,
  MAX_BARS,
  quotaWindow,
  spendOf,
  totalsOf,
} from '~/frameworks/tanstack/ui/derive/usage.ts';

/* 消費のバケットから画面に出す形を導く。

   **cache 読みを消費に足さない。** 足すと、同じ会話を続けるほど数が膨らんで、
   どこで本当に使ったのかが読めなくなる。 */

/* バケットの形は、集計する実装そのものから引く。写して持てば、形が変わったときに片方だけ古いまま残る */
type UsageBucketJson = Parameters<typeof spendOf>[0];

const bucket = (over: Partial<UsageBucketJson> = {}): UsageBucketJson => ({
  t: 0,
  model: 'claude-opus-5',
  i: 0,
  o: 0,
  cr: 0,
  cw: 0,
  n: 1,
  ...over,
});

describe('1 つのバケットの消費', () => {
  it('input と output と cache 書きを足す', () => {
    expect(spendOf(bucket({ i: 10, o: 20, cw: 30 }))).toBe(60);
  });

  it('cache 読みは足さない', () => {
    expect(spendOf(bucket({ i: 10, cr: 1_000_000 }))).toBe(10);
  });
});

describe('足のグリッドを組む', () => {
  const NOW = Date.parse('2026-08-09T12:34:56.000Z');

  /* 現在からの相対に置くと、描き直すたびに全部の足が少しずつ横へ流れる。 */
  it('足の境目はキリの良い時刻に置く', () => {
    const { fromMs } = gridOf(NOW, 15 * 60_000);

    const midnight = new Date(NOW);
    midnight.setHours(0, 0, 0, 0);
    /* 真夜中から足の長さの倍数だけ離れていること。**符号は問わない** —
       対象期間は真夜中より前から始まることがあり、負の余りの 0 は -0 になる。
       時間帯によって符号が変わるので、そのまま 0 と見比べると走らせる場所で結果が変わる。 */
    expect(Math.abs((fromMs - midnight.getTime()) % (15 * 60_000))).toBe(0);
  });

  it('本数は上限を越えない', () => {
    expect(gridOf(NOW, 5 * 60_000).bars).toBe(MAX_BARS);
  });

  it('足が長ければ、対象期間は 7 日で頭打ちになる', () => {
    const { fromMs, bars } = gridOf(NOW, 2 * 3_600_000);

    expect(bars).toBeLessThanOrEqual(MAX_BARS);
    expect(NOW - fromMs).toBeLessThanOrEqual(7 * 86_400_000);
  });
});

describe('足ごとに集計する', () => {
  it('同じ足に入るバケットを足し合わせる', () => {
    const bins = binUsage(
      [bucket({ t: 0, i: 1 }), bucket({ t: 60_000, o: 2 }), bucket({ t: 900_000, cw: 4 })],
      0,
      900_000,
      2,
    );

    expect(bins[0]).toEqual({ total: 3, input: 1, output: 2, cacheWrite: 0, cacheRead: 0 });
    expect(bins[1]?.total).toBe(4);
  });

  it('対象期間より前のバケットは入れない', () => {
    const bins = binUsage([bucket({ t: -1, i: 100 })], 0, 60_000, 1);

    expect(bins[0]?.total).toBe(0);
  });

  it('対象期間の右端より後ろのバケットは、最後の足へ寄せる', () => {
    const bins = binUsage([bucket({ t: 10_000_000, i: 5 })], 0, 60_000, 2);

    expect(bins[1]?.total).toBe(5);
  });
});

describe('モデルごとに分ける', () => {
  it('多い順に並べる', () => {
    const models = byModel([
      bucket({ model: 'a', i: 10 }),
      bucket({ model: 'b', i: 30 }),
      bucket({ model: 'a', i: 5 }),
    ]);

    expect(models).toEqual([
      ['b', 30],
      ['a', 15],
    ]);
  });
});

describe('定額の期間を当てる', () => {
  const NOW = 10 * 3_600_000;

  it('最初の活動が期間を開く', () => {
    const window = quotaWindow([bucket({ t: NOW - 3_600_000, i: 100 })], NOW);

    expect(window.active).toBe(true);
    expect(window.tokens).toBe(100);
    expect(window.endsAtMs).toBe(NOW - 3_600_000 + 5 * 3_600_000);
  });

  it('期間が明けた後の活動は、次の期間を開く', () => {
    const opened = NOW - 20 * 3_600_000;
    const window = quotaWindow(
      [bucket({ t: opened, i: 100 }), bucket({ t: NOW - 60_000, i: 7 })],
      NOW,
    );

    expect(window.tokens, '前の期間のぶんを持ち越してはいけない').toBe(7);
  });

  it('期間が明けていれば、開いていないと言う', () => {
    const window = quotaWindow([bucket({ t: NOW - 10 * 3_600_000, i: 100 })], NOW);

    expect(window.active).toBe(false);
    expect(window.tokens).toBe(0);
  });

  it('何も無ければ、開いていない', () => {
    expect(quotaWindow([], NOW).active).toBe(false);
  });
});

describe('内訳を束ねる', () => {
  it('欄ごとに足す', () => {
    const sum = totalsOf([bucket({ i: 1, o: 2, cr: 3, cw: 4 }), bucket({ i: 10 })]);

    expect(sum).toEqual({ total: 17, input: 11, output: 2, cacheRead: 3, cacheWrite: 4 });
  });
});
