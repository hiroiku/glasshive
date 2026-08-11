import type { IssueSummaryJson } from '~/interface/presenters/issues/issues.presenter.ts';

/* 課題どうしの繋がりを、一列に並べた行の上で表せる形にする。

   繋がりには 2 種類ある。**親子は階層で、それ以外は弧で見せる。** 親子まで弧にすると、
   ほとんどの課題に親が居るので余白が弧で埋まり、どれが本当の依存か読めなくなる。

   弧は本数と重なりを絞る。読めない密度の弧は、描かないほうが正しい。 */

/** 弧 1 本ぶんの横幅 */
export const LANE_WIDTH = 10;

/** 描く弧の上限。これを超える密度では、どの弧も辿れない */
const MAX_EDGES = 24;

/** 重ねる弧の上限 */
const MAX_LANES = 6;

export const edgeColorOf = (type: string): string =>
  type === 'parent-child' ? 'var(--accent)' : type === 'blocks' ? '#f87171' : '#7d8a99';

export interface HierarchyRow {
  readonly issue: IssueSummaryJson;
  readonly depth: number;
  /** 祖先の深さごとに、まだ弟が居るか。居るなら縦線を通す */
  readonly guides: readonly boolean[];
  /** 兄弟の最後か。罫線の形が変わる */
  readonly last: boolean;
}

/* 親が一覧に出ているものだけを子としてまとめる。

   出ていない親の下へ入れると、画面に無い行にぶら下がった行が生まれて、
   どこから来た行なのかが読めなくなる。 */
export function buildHierarchy(shown: readonly IssueSummaryJson[]): HierarchyRow[] {
  const present = new Set(shown.map((issue) => issue.id));
  const parentOf = (issue: IssueSummaryJson): string | null =>
    issue.deps.find(
      (dependency) =>
        dependency.type === 'parent-child' &&
        dependency.on !== null &&
        dependency.on !== issue.id &&
        present.has(dependency.on),
    )?.on ?? null;

  const children = new Map<string, IssueSummaryJson[]>();
  const roots: IssueSummaryJson[] = [];
  for (const issue of shown) {
    const parent = parentOf(issue);
    if (parent === null) {
      roots.push(issue);
      continue;
    }
    const siblings = children.get(parent) ?? [];
    siblings.push(issue);
    children.set(parent, siblings);
  }

  const rows: HierarchyRow[] = [];
  const seen = new Set<string>();
  const visit = (issue: IssueSummaryJson, depth: number, guides: boolean[], last: boolean) => {
    if (issue.id === null || seen.has(issue.id)) return;
    seen.add(issue.id);
    rows.push({ issue, depth, guides, last });
    const kids = children.get(issue.id) ?? [];
    kids.forEach((kid, index) => {
      visit(kid, depth + 1, depth === 0 ? [] : [...guides, !last], index === kids.length - 1);
    });
  };

  for (const root of roots) visit(root, 0, [], true);
  // 親子が輪になっていると根に出てこない。取りこぼした行は根として並べる
  for (const issue of shown)
    if (issue.id !== null && !seen.has(issue.id)) visit(issue, 0, [], true);
  return rows;
}

export interface Edge {
  /** 上側の行 */
  readonly a: number;
  /** 下側の行 */
  readonly b: number;
  /* 矢じりを置く側。**堰き止めている側から、待っている側へ向ける。**

     依存の向きをそのまま描くと矢は「何を待っているか」を指すが、読みたいのは
     着手の順である。先に済むものから後に来るものへ向けておけば、矢を辿るだけで
     取りかかる順になる。 */
  readonly to: number;
  readonly type: string;
  readonly lane: number;
}

/* 表に出ている行どうしだけを結ぶ。**画面の外へは線を引かない。**

   引くと、辿れない線が余白に残る。行の並びが変われば結び直されるので、
   線は「いま見えている並びの上での関係」だけを言う。 */
export function buildEdges(shown: readonly IssueSummaryJson[]): {
  edges: Edge[];
  lanes: number;
} {
  const indexOf = new Map(shown.map((issue, index) => [issue.id, index]));
  const raw: Omit<Edge, 'lane'>[] = [];
  shown.forEach((issue, from) => {
    for (const dependency of issue.deps) {
      if (dependency.on === null) continue;
      // 親子は階層が表している。弧にすると余白が親子で埋まる
      if ((dependency.type ?? '') === 'parent-child') continue;
      const to = indexOf.get(dependency.on);
      if (to === undefined || to === from) continue;
      raw.push({
        a: Math.min(from, to),
        b: Math.max(from, to),
        // `from` が `dependency.on` を待っている。だから矢じりは待っている `from` の側
        to: from,
        type: dependency.type ?? '',
      });
    }
  });
  // 上から順に、短いものを先に置く。長い弧が細い弧をまたぐ形に落ち着く
  raw.sort((x, y) => x.a - y.a || x.b - x.a - (y.b - y.a));

  const laneEnd: number[] = [];
  const edges: Edge[] = [];
  for (const edge of raw) {
    if (edges.length >= MAX_EDGES) break;
    let lane = laneEnd.findIndex((end) => end < edge.a);
    if (lane === -1) {
      if (laneEnd.length >= MAX_LANES) continue;
      lane = laneEnd.length;
      laneEnd.push(edge.b);
    } else {
      laneEnd[lane] = edge.b;
    }
    edges.push({ ...edge, lane });
  }
  return { edges, lanes: laneEnd.length };
}

/* 着手の順。**次に取る 1 件を上へ出すための並びである。**

   塞がれているかは、blocks の相手がまだ生きているかで見る。閉じた相手はもう塞いでいない。 */
export function startRanker(
  issues: readonly IssueSummaryJson[],
): (issue: IssueSummaryJson) => number {
  const alive = new Set(
    issues.filter((issue) => issue.status !== 'closed').map((issue) => issue.id),
  );
  const blocked = (issue: IssueSummaryJson) =>
    issue.deps.some(
      (dependency) =>
        dependency.type === 'blocks' &&
        dependency.on !== null &&
        dependency.on !== issue.id &&
        alive.has(dependency.on),
    );

  return (issue) => {
    if (issue.status === 'open') return blocked(issue) ? 1 : 0;
    if (issue.status === 'closed') return 5;
    // blocked・not_planned と、GitHub が付けた見知らぬ状態。手を付けられるものの後ろに置く
    return 3;
  };
}

export interface ChildProgress {
  readonly total: number;
  readonly closed: number;
}

/* 束ねている課題の消化。**閉じた子も数える母集団から取る。**

   一覧が open だけに絞られていると、閉じた子が母集団から消えて、
   進んだ束ほど進みが少なく見える。 */
export function childProgress(all: readonly IssueSummaryJson[]): Map<string, ChildProgress> {
  const progress = new Map<string, ChildProgress>();
  for (const issue of all) {
    for (const dependency of issue.deps) {
      if (dependency.type !== 'parent-child') continue;
      if (dependency.on === null || dependency.on === issue.id) continue;
      const found = progress.get(dependency.on) ?? { total: 0, closed: 0 };
      progress.set(dependency.on, {
        total: found.total + 1,
        closed: found.closed + (issue.status === 'closed' ? 1 : 0),
      });
    }
  }
  return progress;
}

/* 行どうしの繋がり。**依存も親子も、向きを問わず 1 つの集合にする。**

   ホバーで残すのは「この課題と関わりのある行」であって、依存の向きではない。向きで
   分けると、自分を待っている課題が沈んで、片付けた先が見えなくなる。 */
export function relatedIndex(
  shown: readonly IssueSummaryJson[],
): ReadonlyMap<string, ReadonlySet<string>> {
  const index = new Map<string, Set<string>>();
  const link = (a: string, b: string) => {
    if (a === b) return;
    const found = index.get(a) ?? new Set<string>();
    found.add(b);
    index.set(a, found);
  };
  const present = new Set(shown.map((issue) => issue.id));
  for (const issue of shown) {
    const id = issue.id;
    if (id === null) continue;
    for (const dependency of issue.deps) {
      const on = dependency.on;
      if (on === null || !present.has(on)) continue;
      link(id, on);
      link(on, id);
    }
  }
  return index;
}
