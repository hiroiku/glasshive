import { describe, expect, it } from 'vitest';
import {
  applyTabAction,
  type TabSelectionJson,
} from '~/frameworks/tanstack/ui/derive/tab-selection.ts';

/* クライアント側だけの組み替え。**`preferences.json` の中身を決めるのはこちらではない** —
   ここで確かめるのは、レスポンスが返るまでの見た目が押した通りに動くことだけである。 */

const selection = (parts: Partial<TabSelectionJson> = {}): TabSelectionJson => ({
  version: 1,
  mode: 'all',
  pinned: [],
  hidden: [],
  ...parts,
});

describe('押した手応えを、レスポンスを待たずに見せる', () => {
  it('留めると、並びの末尾に足される', () => {
    expect(
      applyTabAction(selection({ pinned: ['-w-a'] }), {
        action: 'pin',
        id: '-w-b',
      }),
    ).toEqual(selection({ pinned: ['-w-a', '-w-b'] }));
  });

  it('留めると、非表示は解ける', () => {
    expect(
      applyTabAction(selection({ hidden: ['-w-a'] }), {
        action: 'pin',
        id: '-w-a',
      }),
      '留めたほうが後の、強い操作である',
    ).toEqual(selection({ pinned: ['-w-a'] }));
  });

  it('既に留めてあれば、並びは動かない', () => {
    expect(
      applyTabAction(selection({ pinned: ['-w-a', '-w-b'] }), {
        action: 'pin',
        id: '-w-a',
      }).pinned,
      '留め直しでタブの並びが動くと、押した意味が変わる',
    ).toEqual(['-w-a', '-w-b']);
  });

  it('外すと、留めた並びから消える', () => {
    expect(
      applyTabAction(selection({ pinned: ['-w-a', '-w-b'] }), {
        action: 'unpin',
        id: '-w-a',
      }),
      '外すのはタブの並びから下ろすことで、一覧から消すことではない',
    ).toEqual(selection({ pinned: ['-w-b'] }));
  });

  it('並べ替えると、その位置へ移る', () => {
    expect(
      applyTabAction(selection({ pinned: ['-w-a', '-w-b', '-w-c'] }), {
        action: 'move',
        id: '-w-c',
        toIndex: 0,
      }).pinned,
    ).toEqual(['-w-c', '-w-a', '-w-b']);
  });

  it('落とす先が端をはみ出したら、端で丸める', () => {
    const pinned = ['-w-a', '-w-b'];
    expect(
      applyTabAction(selection({ pinned }), {
        action: 'move',
        id: '-w-a',
        toIndex: 99,
      }).pinned,
    ).toEqual(['-w-b', '-w-a']);
    expect(
      applyTabAction(selection({ pinned }), {
        action: 'move',
        id: '-w-b',
        toIndex: -5,
      }).pinned,
    ).toEqual(['-w-b', '-w-a']);

    /* **負の落とし先は 0 で丸める。** そのまま `splice` へ渡すと、負の数は末尾から数えた
       位置と読まれる。留めたものが 2 つまでの組では丸めても丸めなくても同じ並びになるので、
       3 つで見る — ここが緩むと、クライアント側の見た目だけがサーバーと違う位置へ動く。 */
    expect(
      applyTabAction(selection({ pinned: ['-w-a', '-w-b', '-w-c'] }), {
        action: 'move',
        id: '-w-a',
        toIndex: -1,
      }).pinned,
    ).toEqual(['-w-a', '-w-b', '-w-c']);
  });

  it('留めていない id は、並べ替えでは足さない', () => {
    expect(
      applyTabAction(selection({ pinned: ['-w-a'] }), {
        action: 'move',
        id: '-w-x',
        toIndex: 0,
      }).pinned,
      '並べ替えという操作がタブの選択を増やすと、押していないものがタブの並びに載る',
    ).toEqual(['-w-a']);
  });

  it('前のコピーを書き換えない', () => {
    /* **動かせば並びが変わる組で見る。** 動かしても同じ並びに戻る組(留めたものが 1 つだけ、
       落とし先が今いる場所)で見ると、その場で書き換えていてもコピーは元のままに見え、
       このテストは何も確かめないことになる。 */
    const previous = selection({ pinned: ['-w-a', '-w-b'], hidden: ['-w-c'] });

    applyTabAction(previous, { action: 'pin', id: '-w-c' });
    applyTabAction(previous, { action: 'unpin', id: '-w-a' });
    applyTabAction(previous, { action: 'move', id: '-w-a', toIndex: 1 });

    expect(previous, '前のコピーを書き換えると、置けなかったときに戻す先が無くなる').toEqual(
      selection({ pinned: ['-w-a', '-w-b'], hidden: ['-w-c'] }),
    );
  });
});
