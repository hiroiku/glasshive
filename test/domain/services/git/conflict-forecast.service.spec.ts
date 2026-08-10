import { describe, expect, it } from 'vitest';
import {
  forecastConflicts,
  type TouchedFiles,
} from '~/domain/services/git/conflict-forecast.service.ts';

const touched = (name: string, files: readonly string[]): TouchedFiles => ({
  name,
  files: new Set(files),
});

describe('コンフリクトの見込み', () => {
  it('同じファイルを触っている組だけを挙げる', () => {
    const forecasts = forecastConflicts([
      touched('a', ['src/x.ts', 'src/y.ts']),
      touched('b', ['src/y.ts']),
      touched('c', ['docs/z.md']),
    ]);
    expect(forecasts, '触ったパスが重ならない線どうしは、統合の順を気にしなくてよい').toEqual([
      { a: 'a', b: 'b', count: 1, files: ['src/y.ts'] },
    ]);
  });

  it('同じ組を二度挙げない', () => {
    const forecasts = forecastConflicts([touched('a', ['src/x.ts']), touched('b', ['src/x.ts'])]);
    expect(forecasts.length, 'a と b、b と a は同じ組である').toBe(1);
  });

  it('重なりの深い組から並べる', () => {
    const forecasts = forecastConflicts([
      touched('a', ['1', '2', '3']),
      touched('b', ['3']),
      touched('c', ['1', '2', '3']),
    ]);
    expect(
      forecasts.map((forecast) => [forecast.a, forecast.b, forecast.count]),
      '先に手を打つべき組が下に沈むと、目印としての役に立たない',
    ).toEqual([
      ['a', 'c', 3],
      ['a', 'b', 1],
      ['b', 'c', 1],
    ]);
  });

  /* 上限は**リテラルの数値で書く。** 定数と突き合わせると上限が動いても常に釣り合ってしまい、
     見せる件数が変わったことを誰も言えない。 */

  it('挙げる組は 8 で切る', () => {
    const lines = Array.from({ length: 8 }, (_, index) => touched(`t${index}`, ['same.ts']));
    expect(
      forecastConflicts(lines).length,
      '組は線の数の二乗で増える。全部並べると深い組が埋もれる',
    ).toBe(8);
  });

  it('1 組に挙げるファイルは 6 本で切る', () => {
    const files = Array.from({ length: 9 }, (_, index) => `f${index}.ts`);
    const forecasts = forecastConflicts([touched('a', files), touched('b', files)]);
    expect(forecasts[0]?.files.length, '一覧は頭だけでよい').toBe(6);
    expect(
      forecasts[0]?.count,
      '数え上げは切り詰める前に済ませる。切り詰めた後で数えると、深い重なりが浅く見える',
    ).toBe(9);
  });

  it('線が 1 本なら組は無い', () => {
    expect(forecastConflicts([touched('a', ['x'])]), '相手の居ない線はぶつかりようがない').toEqual(
      [],
    );
  });
});
