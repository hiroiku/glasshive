import { describe, expect, it } from 'vitest';
import {
  autoWindow,
  DAY_MS,
  HOUR_MS,
  MAX_WINDOW_MS,
  MIN_WINDOW_MS,
  QUOTA_WINDOW_MS,
  WINDOWS,
  windowLabel,
} from '~/frameworks/tanstack/ui/derive/timeWindow.ts';

/* 一度に見る幅は、ウォーターフォールと Tokens で同じ語彙でなければならない。

   **`auto` は刻みへ丸める。** ちょうどの幅に切ると、`auto` から手で選んだ幅へ移った瞬間に
   軸そのものが変わって、同じものを見ているのかどうかが読めなくなる。 */

const NOW = Date.parse('2026-08-09T12:00:00Z');

describe('選べる幅', () => {
  it('狭い順に並んでいる', () => {
    const steps = WINDOWS.map((preset) => preset.key).filter(
      (key): key is number => typeof key === 'number',
    );

    expect(steps, '並びが崩れると `auto` が広いほうから当ててしまう').toEqual(
      [...steps].sort((a, b) => a - b),
    );
  });

  it('先頭は `auto`', () => {
    expect(WINDOWS[0]?.key).toBe('auto');
  });

  it('定額枠の 5h と 7d を含む', () => {
    const keys = WINDOWS.map((preset) => preset.key);

    expect(keys).toContain(QUOTA_WINDOW_MS);
    expect(keys).toContain(MAX_WINDOW_MS);
  });
});

describe('`auto` の幅', () => {
  it('いちばん古い記録が入る、いちばん狭い刻みを採る', () => {
    expect(autoWindow(NOW - 3 * HOUR_MS, NOW), '3 時間ぶんは 5h に収まる').toBe(QUOTA_WINDOW_MS);
    expect(autoWindow(NOW - 40 * 60_000, NOW), '40 分ぶんは 30m に収まらない').toBe(HOUR_MS);
  });

  it('刻みちょうどのときは、その刻みを採る', () => {
    expect(autoWindow(NOW - HOUR_MS, NOW)).toBe(HOUR_MS);
  });

  it('素材より古いものが在っても、広げない', () => {
    expect(autoWindow(NOW - 30 * DAY_MS, NOW)).toBe(MAX_WINDOW_MS);
  });

  it('何も見つからなければ、いちばん狭い幅に落とす', () => {
    expect(
      autoWindow(null, NOW),
      '広い幅で空を出すと、静かだったのか何も無いのかが同じ絵になる',
    ).toBe(MIN_WINDOW_MS);
  });
});

describe('幅のラベル', () => {
  it('分・時間・日で読み分ける', () => {
    expect(windowLabel(30 * 60_000)).toBe('30m');
    expect(windowLabel(5 * HOUR_MS)).toBe('5h');
    expect(windowLabel(7 * DAY_MS)).toBe('7d');
  });
});
