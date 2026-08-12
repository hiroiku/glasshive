import { describe, expect, it } from 'vitest';
import { formatByteRange, formatDue, formatSince } from '~/frameworks/tanstack/ui/format.ts';
import { defaultTranslator as t } from '~/frameworks/tanstack/ui/i18n/useT.ts';

/* 過ぎた時刻と、これから来る時刻は別の読み方をする。

   `formatSince` は過ぎた時刻を読むためのもので、負の差を 0 で止める。期日をそこへ渡すと
   来月の締切が「0s ago」として出るので、期日には専用の言い方が要る。 */

const NOW = Date.parse('2026-08-10T12:00:00Z');
const DAY_MS = 86_400_000;

describe('過ぎた時刻', () => {
  it('刻みを粗くしていく', () => {
    expect(formatSince(t, NOW - 5_000, NOW)).toBe('5s ago');
    expect(formatSince(t, NOW - 5 * 60_000, NOW)).toBe('5m ago');
    expect(formatSince(t, NOW - 5 * 3_600_000, NOW)).toBe('5h ago');
    expect(formatSince(t, NOW - 5 * DAY_MS, NOW)).toBe('5d ago');
  });

  it('時計のずれで先の時刻が来ても、負にはしない', () => {
    expect(formatSince(t, NOW + 3_000, NOW)).toBe('0s ago');
  });
});

describe('期日', () => {
  it('残りを日で言う', () => {
    expect(formatDue(t, new Date(NOW + 21 * DAY_MS).toISOString(), NOW)).toBe('in 21d');
  });

  it('過ぎた期日は、過ぎたと言う', () => {
    expect(
      formatDue(t, new Date(NOW - 3 * DAY_MS).toISOString(), NOW),
      '過ぎた締切を「in -3d」と書くと、読む人は一度立ち止まる',
    ).toBe('3d overdue');
  });

  it('当日は today', () => {
    expect(formatDue(t, new Date(NOW + 3_600_000).toISOString(), NOW)).toBe('today');
  });

  it('読めない時刻と、無い期日は空にする', () => {
    expect(formatDue(t, null, NOW)).toBe('');
    expect(formatDue(t, 'not a time', NOW)).toBe('');
  });
});

/* 読めた量と総量を 1 行にする。**単位は総量のほうで決める** —— 読めた量で決めると、
   読み進むたびに単位が変わって、同じバーの下で数が飛ぶ。 */
describe('読めた量と総量', () => {
  it('総量の大きさに合う単位を選ぶ', () => {
    expect(formatByteRange(t, 0, 512)).toBe('0 of 512 B');
    expect(formatByteRange(t, 512, 1024)).toBe('0.5 of 1.0 KiB');
    expect(formatByteRange(t, 2_000_000, 4_000_000)).toBe('1.9 of 3.8 MiB');
    expect(formatByteRange(t, 1024 ** 3, 8 * 1024 ** 3)).toBe('1.0 of 8.0 GiB');
  });

  it('これ以上の単位は持たないので、いちばん上で止める', () => {
    expect(formatByteRange(t, 0, 9 * 1024 ** 5), '知らない単位を名乗るより、大きな数を出す').toBe(
      '0.0 of 9437184.0 GiB',
    );
  });

  /* 小さいほうが自分の単位で丸まると `900.0 of 1.2 MiB` のように、大きいほうが小さく
     見える並びになる。総量が MiB なら、読めた量も MiB で丸める。 */
  it('読めた量が小さくても、総量と同じ単位で出す', () => {
    expect(formatByteRange(t, 100, 4_000_000)).toBe('0.0 of 3.8 MiB');
  });

  it('B のときだけ小数を出さない', () => {
    expect(formatByteRange(t, 300, 512), '512.0 B は在りもしない精度を出す').toBe('300 of 512 B');
  });

  it('負の量は 0 として出す', () => {
    expect(formatByteRange(t, -5, 2048)).toBe('0.0 of 2.0 KiB');
    expect(formatByteRange(t, -5, -5)).toBe('0 of 0 B');
  });
});
