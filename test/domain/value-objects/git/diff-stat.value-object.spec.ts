import { describe, expect, it } from 'vitest';
import {
  type DiffFileStat,
  MAX_DIFF_FILES,
  summarizeDiff,
} from '~/domain/value-objects/git/diff-stat.value-object.ts';

const file = (path: string, add: number, del: number): DiffFileStat => ({
  path,
  add,
  del,
});

describe('差分の姿', () => {
  it('触ったファイルが 1 本も無ければ数え上げも無い', () => {
    expect(
      summarizeDiff([]),
      '0 本の差分に「0 行増えて 0 行減った」と言うと、差分があったように読める',
    ).toEqual({ stat: null, files: [] });
  });

  it('増減はぜんぶ足す', () => {
    expect(
      summarizeDiff([file('a.ts', 12, 3), file('b.ts', 1, 4)]).stat,
      '数え上げは全体の話',
    ).toEqual({ files: 2, add: 13, del: 7 });
  });

  /* 上限は**数そのものを書く。** 定数と突き合わせると、上限が動いても常に釣り合うので、
     見せる窓が変わったことを誰も言えない。 */

  it('動きの大きい順に 6 本だけを見せる', () => {
    const rows = Array.from({ length: 9 }, (_, index) => file(`f${index}.ts`, index, 0));
    const summary = summarizeDiff(rows);
    expect(summary.files.length, '全部並べても目で追えない').toBe(6);
    expect(
      summary.files[0]?.path,
      '大きく動いたファイルが下に沈むと、一覧を見る意味が無くなる',
    ).toBe(`f${rows.length - 1}.ts`);
  });

  it('本数は切り詰める前に数える', () => {
    const rows = Array.from({ length: MAX_DIFF_FILES + 3 }, (_, index) =>
      file(`f${index}.ts`, 1, 0),
    );
    expect(
      summarizeDiff(rows).stat?.files,
      '切り詰めた後で数えると、6 本より多く触った差分がどれも 6 本に見える',
    ).toBe(rows.length);
  });

  it('渡された並びを書き換えない', () => {
    const rows = [file('a.ts', 1, 0), file('b.ts', 9, 0)];
    summarizeDiff(rows);
    expect(
      rows.map((row) => row.path),
      '導出が渡された値を並べ替えると、呼んだ側の持ち物が黙って変わる',
    ).toEqual(['a.ts', 'b.ts']);
  });
});
