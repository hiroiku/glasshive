import { describe, expect, it } from 'vitest';
import {
  move,
  type ObservedProjectRef,
  reconcile,
  unwatch,
  visibleTabs,
  watch,
} from '~/domain/services/workspace/watched-projects.service.ts';
import {
  DEFAULT_WATCHED_PROJECTS,
  type WatchedProjects,
} from '~/domain/value-objects/workspace/watched-projects.value-object.ts';

/* 観ると決めたディレクトリの記録。

   **記録は観測を作り出さない。** ここにパスが在ることは、そこに何かが在ることの証しには
   ならない。観測に在るものだけがタブに並ぶ。 */

const of = (...paths: string[]): WatchedProjects => ({ ...DEFAULT_WATCHED_PROJECTS, paths });

const seen = (...pairs: [string, string][]): readonly ObservedProjectRef[] =>
  pairs.map(([id, path]) => ({ id, path }));

describe('記録を整える', () => {
  it('同じ場所を 2 度覚えない。並びの順は変えない', () => {
    expect(reconcile(of('/src/b', '/src/a', '/src/b/')).paths).toEqual(['/src/b', '/src/a']);
  });
});

describe('観ると決める', () => {
  it('末尾に足す', () => {
    expect(watch(of('/src/a'), '/src/b').paths).toEqual(['/src/a', '/src/b']);
  });

  it('既に記録して在れば、順は変えない', () => {
    expect(watch(of('/src/a', '/src/b'), '/src/a').paths).toEqual(['/src/a', '/src/b']);
  });

  /* 空のパスは、どのディレクトリも指していない。記録に入れると、押しても何も無いタブが残る。 */
  it('空のパスは記録しない', () => {
    expect(watch(of('/src/a'), '').paths).toEqual(['/src/a']);
  });
});

describe('観るのをやめる', () => {
  it('記録から外す', () => {
    expect(unwatch(of('/src/a', '/src/b'), '/src/a').paths).toEqual(['/src/b']);
  });

  /* 記録した打ち方と、押した相手の書き表し方が違うだけで外れないと、押しても消えないタブになる。 */
  it('書き表し方が違っても、同じ場所なら外す', () => {
    expect(unwatch(of('/src/a', '/src/b'), '/src/a/').paths).toEqual(['/src/b']);
  });

  it('記録していないものを外しても、何も起きない', () => {
    expect(unwatch(of('/src/a'), '/src/zzz').paths).toEqual(['/src/a']);
  });
});

describe('並びを変える', () => {
  it('落とした先へ入れ直す', () => {
    expect(move(of('/a', '/b', '/c'), '/c', 0).paths).toEqual(['/c', '/a', '/b']);
  });

  /* 負の位置を「末尾から数える」と読むと、前へ落としたものが後ろへ入る。 */
  it('端をはみ出したら端で丸める', () => {
    expect(move(of('/a', '/b'), '/a', 9).paths).toEqual(['/b', '/a']);
    expect(move(of('/a', '/b', '/c'), '/c', -1).paths).toEqual(['/c', '/a', '/b']);
  });

  /* 並べ替えという操作が記録を増やしてはいけない。 */
  it('記録していないものは動かせない', () => {
    expect(move(of('/a', '/b'), '/c', 0).paths).toEqual(['/a', '/b']);
  });
});

describe('タブに出すもの', () => {
  it('記録した順に、観測できているものだけを並べる', () => {
    const watched = of('/src/b', '/src/gone', '/src/a');

    expect(
      visibleTabs(watched, seen(['a', '/src/a'], ['b', '/src/b'])),
      '観測の側の順に従うと、人が並べ替えたタブが読み込みのたびに入れ替わる',
    ).toEqual(['b', 'a']);
  });

  /* 消えた worktree を指すタブが残ると、押しても何も無い画面が開く。記録そのものは残る。 */
  it('観測できていないものは出さない', () => {
    expect(visibleTabs(of('/src/gone'), seen(['a', '/src/a']))).toEqual([]);
  });

  it('書き表し方が違っても、同じ場所なら出す', () => {
    expect(visibleTabs(of('/src/a/'), seen(['a', '/src/a']))).toEqual(['a']);
  });
});
