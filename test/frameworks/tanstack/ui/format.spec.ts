import { describe, expect, it } from 'vitest';
import { formatDue, formatSince } from '~/frameworks/tanstack/ui/format.ts';

/* 過ぎた時刻と、これから来る時刻は別の読み方をする。

   `formatSince` は過ぎた時刻を読むためのもので、負の差を 0 で止める。期日をそこへ渡すと
   来月の締切が「0s ago」として出るので、期日には専用の言い方が要る。 */

const NOW = Date.parse('2026-08-10T12:00:00Z');
const DAY_MS = 86_400_000;

describe('過ぎた時刻', () => {
  it('刻みを粗くしていく', () => {
    expect(formatSince(NOW - 5_000, NOW)).toBe('5s ago');
    expect(formatSince(NOW - 5 * 60_000, NOW)).toBe('5m ago');
    expect(formatSince(NOW - 5 * 3_600_000, NOW)).toBe('5h ago');
    expect(formatSince(NOW - 5 * DAY_MS, NOW)).toBe('5d ago');
  });

  it('時計のずれで先の時刻が来ても、負にはしない', () => {
    expect(formatSince(NOW + 3_000, NOW)).toBe('0s ago');
  });
});

describe('期日', () => {
  it('残りを日で言う', () => {
    expect(formatDue(new Date(NOW + 21 * DAY_MS).toISOString(), NOW)).toBe('in 21d');
  });

  it('過ぎた期日は、過ぎたと言う', () => {
    expect(
      formatDue(new Date(NOW - 3 * DAY_MS).toISOString(), NOW),
      '過ぎた締切を「in -3d」と書くと、読む人は一度立ち止まる',
    ).toBe('3d overdue');
  });

  it('当日は today', () => {
    expect(formatDue(new Date(NOW + 3_600_000).toISOString(), NOW)).toBe('today');
  });

  it('読めない時刻と、無い期日は空にする', () => {
    expect(formatDue(null, NOW)).toBe('');
    expect(formatDue('not a time', NOW)).toBe('');
  });
});
