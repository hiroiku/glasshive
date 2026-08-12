import { describe, expect, it } from 'vitest';
import { applyTabAction } from '~/frameworks/tanstack/ui/derive/tab-selection.ts';

/* 押した手応えを待たせないための、クライアント側だけの組み替え。

   **これは `preferences.json` ではない。** 本当の組み替えは向こう側が読み直してからする。
   ここでするのは、結果が返るまでの見た目を合わせることだけである。

   組み替えるのはタブに並ぶ id で、記録そのもの(絶対パス)は知らない。知らないままでよい ——
   押した相手の id は分かっているので、見た目を合わせるにはそれで足りる。 */

/** 受け取る操作の形は、組み替える関数そのものから借りる。ここから内側の層を覗きに行かない */
const apply = (tabs: readonly string[], action: Parameters<typeof applyTabAction>[1]) =>
  applyTabAction(tabs, action);

describe('観ると決める', () => {
  it('末尾に足す', () => {
    expect(apply(['-w-a'], { action: 'watch', id: '-w-b' })).toEqual(['-w-a', '-w-b']);
  });

  /* 押し直しでタブの並びが動くと、押した意味が変わる。 */
  it('既に並んでいれば、順を変えない', () => {
    const tabs = ['-w-a', '-w-b'];

    expect(apply(tabs, { action: 'watch', id: '-w-a' })).toEqual(['-w-a', '-w-b']);
  });
});

describe('観るのをやめる', () => {
  it('タブ行から下ろす', () => {
    expect(apply(['-w-a', '-w-b'], { action: 'unwatch', id: '-w-a' })).toEqual(['-w-b']);
  });

  it('並んでいないものを外しても、何も起きない', () => {
    expect(apply(['-w-a'], { action: 'unwatch', id: '-w-zzz' })).toEqual(['-w-a']);
  });
});

describe('並べ替える', () => {
  it('落とした先へ入れ直す', () => {
    expect(apply(['-w-a', '-w-b', '-w-c'], { action: 'move', id: '-w-c', toIndex: 0 })).toEqual([
      '-w-c',
      '-w-a',
      '-w-b',
    ]);
  });

  it('端をはみ出したら端で丸める', () => {
    expect(apply(['-w-a', '-w-b'], { action: 'move', id: '-w-a', toIndex: 9 })).toEqual([
      '-w-b',
      '-w-a',
    ]);
    expect(apply(['-w-a', '-w-b'], { action: 'move', id: '-w-b', toIndex: -2 })).toEqual([
      '-w-b',
      '-w-a',
    ]);
  });

  /* ここで足すと、並べ替えという操作が記録を増やすことになる。 */
  it('並んでいないものは動かせない', () => {
    expect(apply(['-w-a'], { action: 'move', id: '-w-zzz', toIndex: 0 })).toEqual(['-w-a']);
  });
});

/* 受け取った並びを書き換えると、置けなかったときに戻す先が無くなる。 */
describe('渡された並び', () => {
  it('元の並びには手を入れない', () => {
    const tabs = ['-w-a', '-w-b'];

    applyTabAction(tabs, { action: 'move', id: '-w-b', toIndex: 0 });
    applyTabAction(tabs, { action: 'unwatch', id: '-w-a' });

    expect(tabs).toEqual(['-w-a', '-w-b']);
  });
});
