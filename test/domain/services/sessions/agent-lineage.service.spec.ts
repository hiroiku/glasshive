import { describe, expect, it } from 'vitest';
import { placeByLineage } from '~/domain/services/sessions/agent-lineage.service.ts';

/* 正本の置き場は段を持たない。誰が誰を呼んだかは覚え書きにしか書かれていないので、
   木の形はここで組む。**組み損ねると子が消える。** 消えた子は観る人には
   「そんな子は動いていない」としか見えないので、どの取りこぼしも根へ倒れることを確かめる。 */

interface Node {
  readonly id: string;
  readonly parentId: string | null;
}

const node = (id: string, parentId: string | null = null): Node => ({ id, parentId });

/** 「id:段」の並びで、置かれた形をひと目で言い表す */
const shape = (nodes: readonly Node[]): string[] =>
  placeByLineage(nodes).map((placed) => `${placed.node.id}:${placed.depth}`);

describe('呼んだ相手の下へ子を入れ直す', () => {
  it('子は親のすぐ下に来て、段が 1 つ深くなる', () => {
    expect(shape([node('a'), node('b', 'a')])).toEqual(['a:1', 'b:2']);
  });

  it('孫は子の下に続き、段は数えた分だけ深くなる', () => {
    expect(shape([node('a'), node('b', 'a'), node('c', 'b')])).toEqual(['a:1', 'b:2', 'c:3']);
  });

  it('離れて渡された子も、呼んだ相手のすぐ下へ寄る', () => {
    // 置き場の並びは産まれた順で、親子が隣り合うとは限らない
    expect(shape([node('a'), node('b'), node('a1', 'a')])).toEqual(['a:1', 'a1:2', 'b:1']);
  });

  it('同じ親を持つ者どうしの並びは、渡された順のまま保つ', () => {
    const placed = shape([node('a'), node('a2', 'a'), node('a1', 'a'), node('a3', 'a')]);

    expect(placed, '並べ替えるのは呼ぶ側の役で、ここは形しか決めない').toEqual([
      'a:1',
      'a2:2',
      'a1:2',
      'a3:2',
    ]);
  });

  it('親がこの並びに居ない子は、消えずに段 1 の根として出る', () => {
    const placed = shape([node('a'), node('orphan', 'gone')]);

    expect(placed, '木から外すと、観る人には動いていない子にしか見えない').toEqual([
      'a:1',
      'orphan:1',
    ]);
  });

  it('親を辿った先が自分でも、止まって根として出る', () => {
    expect(shape([node('a', 'a')])).toEqual(['a:1']);
  });

  it('覚え書きが輪を作っていても止まり、輪の中の全員が一度ずつ出る', () => {
    const placed = shape([node('a', 'c'), node('b', 'a'), node('c', 'b')]);

    expect(
      placed,
      '輪には始まりが無いので誰も子にできない。全員を根に倒して、一人も落とさず一度だけ出す',
    ).toEqual(['a:1', 'b:1', 'c:1']);
  });

  it('輪と輪の外が混ざっていても、外の木は普通に組み上がる', () => {
    const placed = placeByLineage([node('r'), node('r1', 'r'), node('x', 'y'), node('y', 'x')]);

    expect(placed.map((p) => p.node.id).sort()).toEqual(['r', 'r1', 'x', 'y']);
    expect(placed.slice(0, 2).map((p) => `${p.node.id}:${p.depth}`)).toEqual(['r:1', 'r1:2']);
  });

  it('空の並びは空を返す', () => {
    expect(placeByLineage([])).toEqual([]);
  });
});
