import type { IssueSummaryJson } from '~/interface/presenters/issues/issues.presenter.ts';
import { roundedPath } from './edgeShape.ts';

/* 依存の並びを、着手順そのものにする。

   **横に並ぶ位置が意味を持つ。** `layer` 0 は「いま手を付けられて、何かを堰き止めているもの」で、
   `layer` 1 は「`layer` 0 が 1 つ片付けば空くもの」である。飾りの並びではないので、`layer` が
   嘘をつくと着手できないものが着手できると読める。辺を 1 本も持たない課題はどの `layer` にも
   置かず、`loose` として別に返す —— いま着手できる点では `layer` 0 と同じだが、その右に
   続くものが無いので、横軸に置く意味が無い。

   GitHub は依存の輪を通す(自己参照だけを拒む)。**輪は解かずに、輪だと言う。** `layer` に置けば
   「n つ先」に見えるが、輪の中の課題は横軸のどこにも居ない —— それが輪であることの意味である。

   ここに渡すのは**いま開いている課題だけ**である。閉じた課題を混ぜると、片付いた相手が
   いつまでも堰き止めることになる。逆に、検索で絞った一部だけを渡してもいけない —— 消えた
   相手のぶん、堰き止めが軽く見える。 */

/** 依存の種類。親子は階層であって、堰き止めではない */
const BLOCKS = 'blocks';

export interface GraphNode {
  readonly issue: IssueSummaryJson;
  /** どの `layer` に居るか。**輪に囚われているものは`layer` に乗らない**ので `null` */
  readonly layer: number | null;
  /** これを終わらせると空く課題の数。推移的に辿った先の数である */
  readonly unlocks: number;
  /** 直に堰き止めている相手 */
  readonly blockedBy: readonly string[];
  /** 直に堰き止めている先 */
  readonly blocking: readonly string[];
}

export interface DependencyGraph {
  readonly nodes: readonly GraphNode[];
  /** `layer` ごとの id。`loose` と `caught` は入らない */
  readonly layers: readonly (readonly string[])[];
  /* 辺を 1 本も持たない id。堰き止めても堰き止められてもいない。
     **`layer` のグリッドに混ぜない** —— 実際のリポジトリではここが大多数で、
     190x50 のカードで敷き詰めると、依存を持つ数件がその陰に埋もれる。
     いま着手できることに変わりはないので、消さずに別の `band` として出す。 */
  readonly loose: readonly string[];
  /** `layer` に乗らなかった id。輪の中に居るか、輪の下流に居る */
  readonly caught: readonly string[];
  /* この絵が全部だと言えるか。
     1 件でも依存を採り切れていなければ `false` —— **辺の足りない絵を、正しい絵として出さない。** */
  readonly complete: boolean;
}

/** id を持たない課題は辺を張れない。名指せないものは、繋がりも言えない */
const idOf = (issue: IssueSummaryJson): string | null => issue.id;

export function buildDependencyGraph(issues: readonly IssueSummaryJson[]): DependencyGraph {
  const placed = new Map<string, IssueSummaryJson>();
  for (const issue of issues) {
    const id = idOf(issue);
    if (id !== null) placed.set(id, issue);
  }

  const blocking = new Map<string, string[]>();
  const blockedBy = new Map<string, string[]>();
  for (const id of placed.keys()) {
    blocking.set(id, []);
    blockedBy.set(id, []);
  }

  for (const [id, issue] of placed) {
    for (const dependency of issue.deps) {
      if (dependency.type !== BLOCKS) continue;
      const on = dependency.on;
      /* 渡された並びに居ない相手は、辺にしない。閉じた課題も検索から外れた課題も
         ここへ来る。**自分自身を堰き止める辺も落とす** — 自分へ戻る辺は、どう描いても
         「永久に着手できない」としか読めない。 */
      if (on === null || on === id || !placed.has(on)) continue;
      blockedBy.get(id)?.push(on);
      blocking.get(on)?.push(id);
    }
  }

  /* `layer` は Kahn で決める。**輪の中のノードは最後まで残る** ——
     それが「どうやっても着手できるようにならない」ことの、そのままの意味である。 */
  const remaining = new Map<string, number>();
  for (const [id, blockers] of blockedBy) remaining.set(id, blockers.length);

  const layer = new Map<string, number>();
  const queue: string[] = [];
  for (const [id, count] of remaining) {
    if (count === 0) {
      layer.set(id, 0);
      queue.push(id);
    }
  }
  for (let at = 0; at < queue.length; at++) {
    const id = queue[at];
    if (id === undefined) continue;
    for (const next of blocking.get(id) ?? []) {
      layer.set(next, Math.max(layer.get(next) ?? 0, (layer.get(id) ?? 0) + 1));
      const left = (remaining.get(next) ?? 0) - 1;
      remaining.set(next, left);
      if (left === 0) queue.push(next);
    }
  }

  const caught: string[] = [];
  for (const [id, left] of remaining) if (left > 0) caught.push(id);
  const caughtSet = new Set(caught);

  /** これを終わらせると空くもの。同じ辺を二度辿らないので、輪が在っても止まらない */
  const unlocksOf = (from: string): number => {
    const seen = new Set<string>();
    const rest = [...(blocking.get(from) ?? [])];
    while (rest.length > 0) {
      const id = rest.pop();
      if (id === undefined || seen.has(id)) continue;
      seen.add(id);
      rest.push(...(blocking.get(id) ?? []));
    }
    // 輪を辿って自分へ戻ってきても、自分は自分を空けない
    seen.delete(from);
    return seen.size;
  };

  const nodes: GraphNode[] = [];
  for (const [id, issue] of placed) {
    nodes.push({
      issue,
      layer: caughtSet.has(id) ? null : (layer.get(id) ?? 0),
      unlocks: unlocksOf(id),
      blockedBy: blockedBy.get(id) ?? [],
      blocking: blocking.get(id) ?? [],
    });
  }

  /* `layer` ごとに、空ける数の多い順。**同じ `layer` の中では、多くを空けるものを先に置く** ——
     どれも今すぐ取れるので、順番を決めるのは「取ると何が動くか」だけである。 */
  const depth = Math.max(0, ...[...layer.values()].map((value) => value + 1));
  const layers: string[][] = Array.from({ length: depth }, () => []);
  const loose: string[] = [];
  for (const node of nodes) {
    if (node.layer === null) continue;
    if (node.blockedBy.length === 0 && node.blocking.length === 0) {
      loose.push(node.issue.id ?? '');
      continue;
    }
    layers[node.layer]?.push(node.issue.id ?? '');
  }
  /* 触った日の新しい順。**id の文字列順では並べない** —— `#9` が `#10` より後ろに来るし、
     どれも空ける数が 0 なので、順位を決められるのは「最後に動いたのがいつか」しか無い。
     一覧の既定の並びもこれである。 */
  const touchedOf = (id: string) => placed.get(id)?.updated_at ?? '';
  loose.sort((a, b) => touchedOf(b).localeCompare(touchedOf(a)) || a.localeCompare(b));
  const rankOf = new Map(nodes.map((node) => [node.issue.id ?? '', node.unlocks]));
  for (const column of layers) {
    column.sort((a, b) => (rankOf.get(b) ?? 0) - (rankOf.get(a) ?? 0) || a.localeCompare(b));
  }

  return {
    nodes,
    layers,
    loose,
    caught,
    complete: issues.every((issue) => issue.deps_complete),
  };
}

/* 着手順の 3 つの束。**空ける数だけで 1 列に並べない** ——
   いま手を付けられない課題が上位に来て、着手順の一覧が着手できないものから始まる。 */
export interface StartOrder {
  /** 何も待っていない。ここが本当の待ち行列である */
  readonly startable: readonly GraphNode[];
  /** 上が片付けば順に空く */
  readonly waiting: readonly GraphNode[];
  /** 輪に囚われている。依存を 1 本外すまで着手できない */
  readonly caught: readonly GraphNode[];
}

export function startOrder(graph: DependencyGraph): StartOrder {
  const byValue = (a: GraphNode, b: GraphNode) =>
    b.unlocks - a.unlocks || (a.issue.id ?? '').localeCompare(b.issue.id ?? '');

  const startable: GraphNode[] = [];
  const waiting: GraphNode[] = [];
  const caught: GraphNode[] = [];
  for (const node of graph.nodes) {
    if (node.layer === null) caught.push(node);
    else if (node.blockedBy.length === 0) startable.push(node);
    else waiting.push(node);
  }

  return {
    startable: startable.sort(byValue),
    waiting: waiting.sort(byValue),
    caught: caught.sort(byValue),
  };
}

/* 置き場所を決める。**描く側は、ここが返した座標をそのまま使う。**

   `layer` は左から右へ。輪に囚われたものは`layer` の下に、別の `band` として敷く。`layer` の隣の列に置くと
   「n つ先」に見えるが、輪の中の課題は横軸のどこにも居ない。 */

/** カード 1 枚の大きさと、間の空き */
export interface GraphMetrics {
  readonly width: number;
  readonly height: number;
  readonly gapX: number;
  readonly gapY: number;
  /** `layer` と、輪の `band` との間 */
  readonly bandGap: number;
  /** 輪の中で後ろへ戻る辺が、`band` の下へ回り込む深さ */
  readonly dip: number;
  /* 1 つの列に積む行数の上限。**`layer` 0 に 100 件在るリポジトリが実際に在る** ——
     1 列に積み切ると縦に数千 px 伸びて、横軸が着手順だという読み方そのものが届かない。 */
  readonly maxRows: number;
}

/* **たくさん並ぶ前提の寸法である。** カードは 2 行しか持たない —— 1 行目が id と題名、
   2 行目がラベルと顔と PR で、これ以上を 1 枚に入れると縦に伸びて、`layer` 1 つに
   何件も居るリポジトリで画面から出る。 */
export const GRAPH_METRICS: GraphMetrics = {
  width: 190,
  height: 50,
  gapX: 56,
  gapY: 10,
  bandGap: 44,
  dip: 30,
  maxRows: 12,
};

export interface PlacedNode {
  readonly node: GraphNode;
  readonly x: number;
  readonly y: number;
  /** 輪に囚われているか。`band` の中に置いてある */
  readonly caught: boolean;
}

export interface PlacedEdge {
  readonly from: string;
  readonly to: string;
  readonly path: string;
  /** 輪の中どうしを結ぶ辺 */
  readonly cyclic: boolean;
}

export interface GraphLayout {
  readonly nodes: readonly PlacedNode[];
  readonly edges: readonly PlacedEdge[];
  readonly width: number;
  readonly height: number;
  /* `layer` ごとの見出しを置く位置と幅。行数が上限を超えた `layer` は横へ折り返すので、
     見出しはその折り返しぶんをまたぐ。輪の `band` には見出しを付けない */
  readonly columns: readonly {
    readonly x: number;
    readonly width: number;
    readonly layer: number;
  }[];
  /** 輪の `band` の囲い。囚われたものが無ければ `null` */
  readonly band: { readonly y: number; readonly width: number; readonly height: number } | null;
}

/* 辺の通し方は 3 通りある。**どれも直角に折れて、角だけを丸める** —— 曲線で結ぶと
   どこを通っているのかが読めない。一覧の弧と Git の画面の線も同じ描き方である。

   **どれもカードの上を通さない。** 同じ `layer` の並びの中は相手の手前の空きを昇り降りして
   横から入り、`layer` から `band` へ落ちるものは空きを降りて `band` の上の通路を渡り、
   輪の中で後ろへ戻るものは `band` の下を回る。 */
function edgePathOf(
  a: PlacedNode,
  z: PlacedNode,
  m: GraphMetrics,
  /** `layer` の下と輪の `band` の上との間に空けてある、横に渡るための通路 */
  corridorY: number,
): string {
  const half = m.height / 2;
  const centerA = a.x + m.width / 2;
  const centerZ = z.x + m.width / 2;

  // 輪の中で後ろへ戻る辺。`band` の下を回って、相手の下から入る
  if (a.caught && z.caught && z.x <= a.x) {
    const dipY = a.y + m.height + m.dip;
    return roundedPath([
      [centerA, a.y + m.height],
      [centerA, dipY],
      [centerZ, dipY],
      [centerZ, z.y + m.height],
    ]);
  }

  // `layer` から輪の `band` へ落ちる。自分の列の右の空きを降りて、通路を渡って上から入る
  if (!a.caught && z.caught) {
    const lane = a.x + m.width + m.gapX / 2;
    return roundedPath([
      [a.x + m.width, a.y + half],
      [lane, a.y + half],
      [lane, corridorY],
      [centerZ, corridorY],
      [centerZ, z.y],
    ]);
  }

  // 同じ高さなら、真横に 1 本
  if (z.y === a.y) {
    return roundedPath([
      [a.x + m.width, a.y + half],
      [z.x, z.y + half],
    ]);
  }

  /* 高さが違う相手。**相手の手前の空きで昇り降りする** —— 自分の側で昇り降りすると、
     間の列を相手の行の高さで横切ることになり、そこに居るカードの上を通る。 */
  const lane = z.x - m.gapX / 2;
  return roundedPath([
    [a.x + m.width, a.y + half],
    [lane, a.y + half],
    [lane, z.y + half],
    [z.x, z.y + half],
  ]);
}

export function layoutGraph(graph: DependencyGraph, m: GraphMetrics = GRAPH_METRICS): GraphLayout {
  const byId = new Map(graph.nodes.map((node) => [node.issue.id ?? '', node]));
  const placed = new Map<string, PlacedNode>();

  const stepX = m.width + m.gapX;
  const stepY = m.height + m.gapY;

  /* `layer` は左から右へ。**行数が上限を超えたら、同じ `layer` の中で横へ折り返す。**
     1 列に積み切ると縦に伸びて、横軸が着手順だという読み方が画面から出る。 */
  const columns: { x: number; width: number; layer: number }[] = [];
  let atX = 0;
  let tallest = 0;
  graph.layers.forEach((column, at) => {
    if (column.length === 0) return;
    const wraps = Math.ceil(column.length / m.maxRows);
    const rows = Math.ceil(column.length / wraps);
    column.forEach((id, index) => {
      const node = byId.get(id);
      if (node === undefined) return;
      const wrap = Math.floor(index / rows);
      const row = index % rows;
      placed.set(id, { node, x: (atX + wrap) * stepX, y: row * stepY, caught: false });
    });
    columns.push({ x: atX * stepX, width: wraps * stepX - m.gapX, layer: at });
    atX += wraps;
    tallest = Math.max(tallest, rows);
  });

  const bandY = tallest === 0 ? 0 : tallest * stepY - m.gapY + m.bandGap;
  /* 囚われたものは、空ける数の多い順に並べる。輪の中でも「どれを外せば効くか」は違う */
  const caught = [...graph.caught].sort(
    (a, b) => (byId.get(b)?.unlocks ?? 0) - (byId.get(a)?.unlocks ?? 0) || a.localeCompare(b),
  );
  /** 輪の `band` も同じだけ折り返す。`layer` と揃えないと、`band` だけが画面から出る */
  const bandWraps = Math.max(1, Math.ceil(caught.length / m.maxRows));
  const bandRows = Math.max(1, Math.ceil(caught.length / bandWraps));
  caught.forEach((id, at) => {
    const node = byId.get(id);
    if (node === undefined) return;
    placed.set(id, {
      node,
      x: Math.floor(at / bandRows) * stepX,
      y: bandY + (at % bandRows) * stepY,
      caught: true,
    });
  });

  // `layer` の下と `band` の上の真ん中。ここを横に渡れば、どのカードの上も通らない
  const corridorY = bandY - m.bandGap / 2;

  const edges: PlacedEdge[] = [];
  for (const [id, from] of placed) {
    for (const next of from.node.blocking) {
      const to = placed.get(next);
      if (to === undefined) continue;
      edges.push({
        from: id,
        to: next,
        path: edgePathOf(from, to, m, corridorY),
        cyclic: from.caught && to.caught,
      });
    }
  }

  const bandHeight = bandRows * stepY - m.gapY;
  const widest = Math.max(atX, bandWraps, 1);
  const bottom = caught.length === 0 ? tallest * stepY - m.gapY : bandY + bandHeight + m.dip + 18;

  return {
    nodes: [...placed.values()],
    edges,
    width: widest * stepX - m.gapX + 16,
    height: Math.max(bottom, m.height) + 8,
    columns,
    band:
      caught.length === 0
        ? null
        : {
            y: bandY,
            width: bandWraps * stepX - m.gapX + 26,
            height: bandHeight + m.dip + 22,
          },
  };
}
