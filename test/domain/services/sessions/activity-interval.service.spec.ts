import { describe, expect, it } from 'vitest';
import {
  clusterIntervals,
  deriveActivity,
  extractTimestampsMs,
} from '~/domain/services/sessions/activity-interval.service.ts';

const BASE = Date.parse('2026-08-09T00:00:00.000Z');
const at = (offsetMs: number): string => new Date(BASE + offsetMs).toISOString();

describe('字面から時刻を拾う', () => {
  it('入れ子の中の時刻も、現れた順のまま拾う', () => {
    // 内側に外側より前の時刻を置く。並べ替えていれば、現れた順にはならない
    const line = `{"type":"assistant","timestamp":"${at(2_000)}","message":{"content":[{"meta":{"timestamp":"${at(1_000)}"}}]}}`;
    expect(
      extractTimestampsMs(line),
      '読み解かずに字面を探しているので、外側の 1 つだけにはならない',
    ).toEqual([BASE + 2_000, BASE + 1_000]);
  });

  it('読めない時刻の字は落とす', () => {
    const text = [
      `{"timestamp":"${at(0)}"}`,
      '{"timestamp":"きのう"}',
      '{"timestamp":"not-a-time"}',
      `{"timestamp":"${at(5_000)}"}`,
    ].join('\n');
    expect(extractTimestampsMs(text), '読めない 1 つのために他を捨てない').toEqual([
      BASE,
      BASE + 5_000,
    ]);
  });

  it('時刻がどこにも無ければ何も拾わない', () => {
    expect(extractTimestampsMs('{"type":"summary"}\n')).toEqual([]);
    expect(extractTimestampsMs('')).toEqual([]);
  });

  it('先頭が途中で切れていても、残りは拾える', () => {
    // 正本の末尾だけを切り出して渡すので、1 行目はたいてい途中から始まる
    const cutHead = [
      `estamp":"${at(0)}","type":"user"}`,
      `{"type":"assistant","timestamp":"${at(60_000)}"}`,
    ].join('\n');
    expect(extractTimestampsMs(cutHead), '鍵の字が欠けたものを時刻と見なしてはいけない').toEqual([
      BASE + 60_000,
    ]);

    // 書いている途中の行は閉じ引用符が無い。字面が揃うまで時刻とは見なさない
    const halfWritten = `{"type":"assistant","timestamp":"${at(120_000)}"}\n{"type":"user","timestamp":"2026-08-09T00`;
    expect(extractTimestampsMs(halfWritten)).toEqual([BASE + 120_000]);
  });

  it('何度呼んでも同じものを拾う', () => {
    const text = `{"timestamp":"${at(0)}"}\n{"timestamp":"${at(1_000)}"}`;
    const expected = [BASE, BASE + 1_000];
    expect(extractTimestampsMs(text)).toEqual(expected);
    expect(extractTimestampsMs(text), '2 度目が前の呼び出しを引きずってはいけない').toEqual(
      expected,
    );
  });
});

describe('近い時刻を繋いで帯にする', () => {
  it('幅ちょうどの無音は同じ帯、それを超えると別の帯', () => {
    expect(clusterIntervals([BASE, BASE + 120_000]), '境目は「以下」で切る').toEqual([
      { fromMs: BASE, toMs: BASE + 120_000 },
    ]);
    expect(clusterIntervals([BASE, BASE + 121_000]), '幅を超えた無音は帯を分ける').toEqual([
      { fromMs: BASE, toMs: BASE },
      { fromMs: BASE + 121_000, toMs: BASE + 121_000 },
    ]);
  });

  it('順不同で渡しても同じ結果になる', () => {
    const ordered = [BASE, BASE + 60_000, BASE + 300_000, BASE + 360_000];
    const shuffled = [BASE + 300_000, BASE, BASE + 360_000, BASE + 60_000];
    expect(clusterIntervals(shuffled), '時刻の前後は書かれた順ではなく数で決まる').toEqual(
      clusterIntervals(ordered),
    );
    expect(shuffled, '渡された並びを書き換えると、呼んだ側の持ちものが壊れる').toEqual([
      BASE + 300_000,
      BASE,
      BASE + 360_000,
      BASE + 60_000,
    ]);
  });

  it('同じ時刻がいくつ来ても 1 本の帯になる', () => {
    expect(clusterIntervals([BASE, BASE, BASE])).toEqual([{ fromMs: BASE, toMs: BASE }]);
  });

  it('時刻が 1 つだけなら、始まりと終わりが同じ帯になる', () => {
    expect(clusterIntervals([BASE])).toEqual([{ fromMs: BASE, toMs: BASE }]);
  });

  it('上限ちょうどなら畳み直さない', () => {
    // 130 秒ずつ空けて、120 秒幅で 60 本きっかりに分かれるようにする
    const timestamps = Array.from({ length: 60 }, (_, index) => BASE + index * 130_000);
    const intervals = clusterIntervals(timestamps);
    expect(intervals.length, '上限を「超えたら」畳む。ちょうどは畳まない').toBe(60);
    expect(intervals[59], '1 本も繋がっていない').toEqual({
      fromMs: BASE + 59 * 130_000,
      toMs: BASE + 59 * 130_000,
    });
  });

  it('帯が多すぎるときは畳み直すが、全体の始まりと終わりは変えない', () => {
    // 130 秒と 500 秒の無音を交互に置き、120 秒幅では 61 本に分かれるようにする
    const timestamps: number[] = [BASE];
    for (let index = 1; index <= 60; index += 1) {
      const previous = timestamps[index - 1] ?? BASE;
      timestamps.push(previous + (index % 2 === 1 ? 130_000 : 500_000));
    }
    const first = timestamps[0] ?? BASE;
    const last = timestamps[timestamps.length - 1] ?? BASE;
    expect(clusterIntervals(timestamps, { max: 1_000 }).length, '前提として 61 本に分かれる').toBe(
      61,
    );

    const intervals = clusterIntervals(timestamps);
    // 幅を 1 度だけ倍にすると 130 秒の無音だけが繋がり、500 秒の無音は残って 31 本になる
    expect(intervals.length, '広げすぎず、収まる幅で止める').toBe(31);
    expect(intervals[0]?.fromMs, '粗くするだけで、いつから動いていたかは変えない').toBe(first);
    expect(intervals[intervals.length - 1]?.toMs, 'いつまで動いていたかも変えない').toBe(last);
  });

  it('1 度広げて足りなければ、収まるまで広げ直す', () => {
    // 500 秒ずつ空けてあるので、120 秒幅を 3 度倍にして初めて繋がる
    const timestamps = [BASE, BASE + 500_000, BASE + 1_000_000, BASE + 1_500_000];
    expect(clusterIntervals(timestamps, { max: 2 }), '畳み直しは 1 度で終わるとは限らない').toEqual(
      [{ fromMs: BASE, toMs: BASE + 1_500_000 }],
    );
  });

  it('畳み直しでも、広げた幅ちょうどの無音は繋ぐ', () => {
    /* 幅 100 では 3 本。1 度倍にして幅 200 になると、200 の無音は繋がって 2 本で収まる。
       ここを「未満」で切ると収まらず、もう 1 度広げて 1 本まで潰れてしまう。 */
    expect(
      clusterIntervals([BASE, BASE + 200, BASE + 500], { gapMs: 100, max: 2 }),
      '境目は繋ぐときも畳み直すときも「以下」',
    ).toEqual([
      { fromMs: BASE, toMs: BASE + 200 },
      { fromMs: BASE + 500, toMs: BASE + 500 },
    ]);
  });

  it('繋ぐ幅は呼ぶ側から変えられる', () => {
    expect(clusterIntervals([BASE, BASE + 1_000], { gapMs: 500 })).toEqual([
      { fromMs: BASE, toMs: BASE },
      { fromMs: BASE + 1_000, toMs: BASE + 1_000 },
    ]);
  });

  it('時刻が無ければ帯も無い', () => {
    expect(clusterIntervals([])).toEqual([]);
  });

  it('幅が広がらない渡し方をされても止まる', () => {
    // 旧実装に無い歯止め。幅を差し込めるようにした以上、止まらない道を残せない
    expect(clusterIntervals([BASE, BASE + 1_000], { gapMs: 0, max: 0 })).toEqual([
      { fromMs: BASE, toMs: BASE },
      { fromMs: BASE + 1_000, toMs: BASE + 1_000 },
    ]);
    expect(clusterIntervals([BASE], { max: 0 }), '1 本より先は畳めない').toEqual([
      { fromMs: BASE, toMs: BASE },
    ]);
  });
});

describe('拾って畳むところまで', () => {
  it('正本の字面から帯を導く', () => {
    const text = [
      `{"type":"user","timestamp":"${at(0)}"}`,
      `{"type":"assistant","timestamp":"${at(60_000)}"}`,
      `{"type":"user","timestamp":"${at(600_000)}"}`,
      '',
    ].join('\n');
    expect(deriveActivity(text, true)).toEqual({
      intervals: [
        { fromMs: BASE, toMs: BASE + 60_000 },
        { fromMs: BASE + 600_000, toMs: BASE + 600_000 },
      ],
      complete: true,
    });
  });

  it('正本の中で時刻が前後していても、数の順で帯にする', () => {
    // 拾うのは現れた順なので、繋ぐ前に並べ直さないと帯が崩れる
    const text = [
      `{"type":"user","timestamp":"${at(600_000)}"}`,
      `{"type":"assistant","timestamp":"${at(0)}"}`,
      `{"type":"user","timestamp":"${at(60_000)}"}`,
    ].join('\n');
    expect(deriveActivity(text, true).intervals).toEqual([
      { fromMs: BASE, toMs: BASE + 60_000 },
      { fromMs: BASE + 600_000, toMs: BASE + 600_000 },
    ]);
  });

  it('先頭まで読めたかは、渡されたとおりに持ち帰る', () => {
    expect(deriveActivity('', false), '読めていないだけで、これより前が無いのではない').toEqual({
      intervals: [],
      complete: false,
    });
    expect(deriveActivity('', true)).toEqual({ intervals: [], complete: true });
  });
});
