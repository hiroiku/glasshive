import { describe, expect, it } from 'vitest';
import {
  buildDependencyGraph,
  GRAPH_METRICS,
  layoutGraph,
  startOrder,
} from '~/frameworks/tanstack/ui/derive/dependencyGraph.ts';

/* 依存の並びは着手順そのものである。

   **GitHub は輪を通す。** 自己参照だけを拒み、`#2 → #4 → #5 → #2` は実際に作れる
   (hiroiku/glasshive-atlas で確かめた)。だから輪は想定外の入力ではなく、通常の入力である。
   `layer` を組む側が輪で止まったり、輪の中の課題を「n つ先」と言ったりしてはいけない。 */

/* 課題の形は、組み立てる実装そのものから引く。写して持つと、形が変わったときに
   片方だけ古いまま残る。 */
type Issue = Parameters<typeof buildDependencyGraph>[0][number];

const issue = (
  id: string,
  blockedBy: readonly string[] = [],
  over: Partial<Issue> = {},
): Issue => ({
  id,
  title: id,
  status: 'open',
  priority: null,
  issue_type: null,
  labels: [],
  assignee: null,
  owner: null,
  created_at: null,
  updated_at: null,
  deps: blockedBy.map((on) => ({ on, type: 'blocks' })),
  deps_complete: true,
  github: null,
  ...over,
});

/** id から `layer` を引く。並べ方ではなく、どの `layer` に居るかだけを見たいとき */
const layersOf = (issues: readonly Issue[]) => {
  const graph = buildDependencyGraph(issues);
  return new Map(graph.nodes.map((node) => [node.issue.id, node.layer]));
};

describe('`layer` は着手順そのもの', () => {
  it('何も待っていないものが `layer` 0 に来る', () => {
    const layers = layersOf([issue('#1'), issue('#2', ['#1']), issue('#3', ['#2'])]);

    expect(layers.get('#1'), '`layer` 0 は「いま手を付けられる課題の全部」である').toBe(0);
    expect(layers.get('#2')).toBe(1);
    expect(layers.get('#3')).toBe(2);
  });

  it('待つ相手が 2 つあるときは、遅いほうに合わせる', () => {
    /* `#4` は `#1`(`layer` 0)と `#3`(`layer` 2)に堰き止められている。
       早いほうに合わせると、まだ空いていないのに空いたように見える。 */
    const layers = layersOf([
      issue('#1'),
      issue('#2', ['#1']),
      issue('#3', ['#2']),
      issue('#4', ['#1', '#3']),
    ]);

    expect(layers.get('#4')).toBe(3);
  });

  it('親子は堰き止めではない', () => {
    const child = issue('#2');
    const graph = buildDependencyGraph([
      issue('#1'),
      { ...child, deps: [{ on: '#1', type: 'parent-child' }] },
    ]);

    expect(
      graph.nodes.find((node) => node.issue.id === '#2')?.layer,
      '親が居ることは、親を待っていることではない',
    ).toBe(0);
  });

  it('渡した並びに居ない相手は、堰き止めない', () => {
    /* 閉じた課題も、検索から外れた課題もここへ来る。**渡す並びを決めるのは呼ぶ側で、
       それがそのまま「まだ生きている堰き止め」の定義になる。** */
    const layers = layersOf([issue('#2', ['#1'])]);

    expect(layers.get('#2')).toBe(0);
  });

  it('自分で自分を堰き止める辺は落とす', () => {
    const layers = layersOf([issue('#1', ['#1'])]);

    expect(layers.get('#1'), '落とさないと、この 1 件だけで輪になる').toBe(0);
  });
});

describe('輪は解かずに、輪だと言う', () => {
  const ring = [issue('#2', ['#5']), issue('#4', ['#2']), issue('#5', ['#4'])];

  it('輪の中の課題は、`layer` に乗らない', () => {
    const graph = buildDependencyGraph(ring);

    expect([...graph.caught].sort()).toEqual(['#2', '#4', '#5']);
    for (const node of graph.nodes) {
      expect(
        node.layer,
        '`layer` に置けば「n つ先」に見えるが、輪の中はどの `layer` にも居ない',
      ).toBe(null);
    }
  });

  it('輪が在っても、`layer` の組み立ては止まらない', () => {
    const layers = layersOf([...ring, issue('#9'), issue('#10', ['#9'])]);

    expect(layers.get('#9'), '輪と関わらない鎖は、そのまま `layer` に乗る').toBe(0);
    expect(layers.get('#10')).toBe(1);
  });

  it('輪の下流も`layer` に乗らない', () => {
    /* 輪が解けるまで空かないのは、輪の中だけではない。**その先も同じである。** */
    const graph = buildDependencyGraph([...ring, issue('#6', ['#5'])]);

    expect([...graph.caught].sort()).toEqual(['#2', '#4', '#5', '#6']);
  });

  it('空ける数を数えるとき、輪を回り続けない', () => {
    const graph = buildDependencyGraph(ring);
    const node = graph.nodes.find((found) => found.issue.id === '#2');

    expect(node?.unlocks, '自分は自分を空けない').toBe(2);
  });
});

describe('空ける数', () => {
  it('推移的に辿った先の数を数える', () => {
    const graph = buildDependencyGraph([
      issue('#1'),
      issue('#2', ['#1']),
      issue('#3', ['#2']),
      issue('#9'),
    ]);
    const unlocks = new Map(graph.nodes.map((node) => [node.issue.id, node.unlocks]));

    expect(unlocks.get('#1'), '直に空くのは 1 件でも、その先まで空く').toBe(2);
    expect(unlocks.get('#2')).toBe(1);
    expect(unlocks.get('#3')).toBe(0);
    expect(unlocks.get('#9'), '誰も堰き止めていない課題は、何も空けない').toBe(0);
  });

  it('同じ課題を二度数えない', () => {
    // `#1` は `#2` と `#3` の両方を空け、その両方が `#4` を待たせている
    const graph = buildDependencyGraph([
      issue('#1'),
      issue('#2', ['#1']),
      issue('#3', ['#1']),
      issue('#4', ['#2', '#3']),
    ]);

    expect(graph.nodes.find((node) => node.issue.id === '#1')?.unlocks).toBe(3);
  });
});

describe('依存を採り切れていないとき', () => {
  it('この絵が全部だとは言わない', () => {
    const graph = buildDependencyGraph([
      issue('#1'),
      issue('#2', ['#1'], { deps_complete: false }),
    ]);

    expect(graph.complete, '辺の足りない絵を、正しい絵として出さない').toBe(false);
  });

  it('全部採れていれば、そう言う', () => {
    expect(buildDependencyGraph([issue('#1'), issue('#2', ['#1'])]).complete).toBe(true);
  });
});

describe('着手順は 3 つに分ける', () => {
  const order = startOrder(
    buildDependencyGraph([
      issue('#1'),
      issue('#6'),
      issue('#3', ['#6']),
      issue('#2', ['#5']),
      issue('#5', ['#2']),
    ]),
  );

  it('いま手を付けられるものだけを先頭の束にする', () => {
    expect(
      order.startable.map((node) => node.issue.id),
      '空ける数だけで 1 列に並べると、着手順の一覧が着手できないものから始まる',
    ).toEqual(['#6', '#1']);
  });

  it('待っているものは別の束にする', () => {
    expect(order.waiting.map((node) => node.issue.id)).toEqual(['#3']);
  });

  it('輪の中は順位を付けない束にする', () => {
    expect(
      order.caught.map((node) => node.issue.id).sort(),
      '順位を付けると、着手できるものに見える',
    ).toEqual(['#2', '#5']);
  });

  it('束の中では、空ける数の多いものが上に来る', () => {
    expect(order.startable[0]?.issue.id, '#6 は #3 を空け、#1 は何も空けない').toBe('#6');
  });
});

describe('辺は直角に折れる', () => {
  /* 曲線で結ぶと、どこを通っているのかが読めない。一覧の弧も Git の画面の線も直角に
     折れて角だけを丸めてあるので、ここだけ別の描き方にすると同じ依存が別の顔で出る。 */
  const pathsOf = (issues: readonly Issue[]) =>
    layoutGraph(buildDependencyGraph(issues)).edges.map((edge) => edge.path);

  it('三次ベジェを使わない', () => {
    const paths = pathsOf([issue('#1'), issue('#2', ['#1']), issue('#3', ['#2'])]);

    expect(paths.length).toBeGreaterThan(0);
    expect(
      paths.filter((path) => path.includes('C')),
      '曲線で結ぶと、線がどこを通っているのかが読めない',
    ).toEqual([]);
  });

  it('同じ高さに並ぶ相手へは、真横に 1 本引く', () => {
    const paths = pathsOf([issue('#1'), issue('#2', ['#1'])]);

    expect(paths[0], '折れていない線に角を作らない').not.toContain('Q');
  });

  it('高さの違う相手へは、角を丸めて折れる', () => {
    // #3 と #4 が `layer` 1 に 2 件並ぶので、#1 から #4 への辺は高さをまたぐ
    const paths = pathsOf([issue('#1'), issue('#2'), issue('#3', ['#2']), issue('#4', ['#1'])]);

    expect(
      paths.some((path) => path.includes('Q')),
      '角を丸めずに折ると、線が刺さって見える',
    ).toBe(true);
  });

  it('輪の中で後ろへ戻る辺は、`band` の下まで降りてから戻る', () => {
    const paths = pathsOf([issue('#2', ['#5']), issue('#5', ['#2'])]);
    /* `d` に出てくる y の一番下。カードの下端より下まで降りていれば、カードの上を通らない */
    const depthOf = (path: string) =>
      Math.max(...[...path.matchAll(/ (-?[\d.]+)(?= |$)/g)].map((found) => Number(found[1])));

    expect(paths.length, '輪は 2 本の辺でできている').toBe(2);
    expect(
      Math.min(...paths.map(depthOf)),
      'カードの下を回らないと、戻る辺がカードの上を横切る',
    ).toBeGreaterThanOrEqual(GRAPH_METRICS.height + GRAPH_METRICS.dip);
  });
});

describe('行数の多い `layer` は横へ折り返す', () => {
  /* `layer` 0 に 100 件在るリポジトリは珍しくない。1 列に積み切ると縦に数千 px 伸びて、
     横軸が着手順だという読み方そのものが画面から出る。 */
  const many = Array.from({ length: 40 }, (_, at) => issue(`#${at + 1}`));

  it('1 列の行数は上限を超えない', () => {
    const layout = layoutGraph(buildDependencyGraph(many));
    const rows = new Set(layout.nodes.map((placed) => placed.y)).size;

    expect(rows).toBeLessThanOrEqual(GRAPH_METRICS.maxRows);
  });

  it('折り返しても、`layer` は 1 つのまま', () => {
    const layout = layoutGraph(buildDependencyGraph(many));

    expect(layout.columns.length, '折り返しを別の `layer` にすると「n つ先」が嘘になる').toBe(1);
    expect(layout.columns[0]?.layer).toBe(0);
  });

  it('見出しは、折り返したぶんをまたぐ幅を持つ', () => {
    const layout = layoutGraph(buildDependencyGraph(many));
    const column = layout.columns[0];
    if (column === undefined) throw new Error('列が無い');

    expect(column.width, '幅が 1 列ぶんだと、どこまでが同じ `layer` か読めない').toBeGreaterThan(
      GRAPH_METRICS.width,
    );
    expect(column.width).toBeLessThanOrEqual(layout.width);
  });

  it('縦に伸ばすかわりに、横に広がる', () => {
    const layout = layoutGraph(buildDependencyGraph(many));

    expect(layout.height).toBeLessThan(GRAPH_METRICS.maxRows * (GRAPH_METRICS.height + 20));
    expect(layout.width).toBeGreaterThan(GRAPH_METRICS.width * 2);
  });
});
