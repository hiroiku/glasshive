import { describe, expect, it } from 'vitest';
import {
  buildEdges,
  buildHierarchy,
  childProgress,
  relatedIndex,
  startRanker,
} from '~/frameworks/tanstack/ui/derive/issueTree.ts';

/* 課題どうしの繋がりを、一列に並べた行の上で表す。

   **親子は階層、それ以外は弧。** 混ぜると、ほとんどの課題に親が居るせいで
   余白が親子の弧で埋まり、どれが本当の依存か読めなくなる。 */

/* 課題の形は、階層にまとめる実装そのものから引く。ここは外の層の名前を `import` できないし、
   写して持てば、形が変わったときに片方だけ古いまま残る。 */
type Issue = Parameters<typeof buildHierarchy>[0][number];
type Dep = Issue['deps'][number];

const issue = (id: string, over: Partial<Issue> = {}): Issue => ({
  id,
  title: id,
  status: 'open',
  issue_type: 'task',
  labels: [],
  assignee: null,
  created_at: null,
  updated_at: null,
  closed_at: null,
  deps: [],
  deps_complete: true,
  github: {
    url: null,
    labels: [],
    assignees: [],
    author: null,
    milestone: null,
    issue_type_color: null,
    sub_issues: null,
    pull_requests: [],
    comments: 0,
    reactions: 0,
  },
  ...over,
});

const dep = (on: string, type: string): Dep => ({ on, type });

describe('親子を階層にまとめる', () => {
  it('一覧に出ている親の下へ子を入れる', () => {
    const rows = buildHierarchy([issue('a'), issue('b', { deps: [dep('a', 'parent-child')] })]);

    expect(rows.map((row) => [row.issue.id, row.depth])).toEqual([
      ['a', 0],
      ['b', 1],
    ]);
  });

  /* 出ていない親の下へ入れると、画面に無い行にぶら下がった行が生まれる。 */
  it('親が一覧に出ていなければ、根として並べる', () => {
    const rows = buildHierarchy([issue('b', { deps: [dep('missing', 'parent-child')] })]);

    expect(rows.map((row) => row.depth)).toEqual([0]);
  });

  it('末の子だけ、罫線の形が変わる', () => {
    const rows = buildHierarchy([
      issue('a'),
      issue('b', { deps: [dep('a', 'parent-child')] }),
      issue('c', { deps: [dep('a', 'parent-child')] }),
    ]);

    expect(rows.map((row) => row.last)).toEqual([true, false, true]);
  });

  /* 親子が循環していると、根から辿っても出てこない。落とすと行が画面から消える。 */
  it('親子が循環していても、行を落とさない', () => {
    const rows = buildHierarchy([
      issue('a', { deps: [dep('b', 'parent-child')] }),
      issue('b', { deps: [dep('a', 'parent-child')] }),
    ]);

    expect(rows).toHaveLength(2);
  });
});

describe('依存を弧にする', () => {
  it('親子は弧にしない', () => {
    const { edges } = buildEdges([issue('a'), issue('b', { deps: [dep('a', 'parent-child')] })]);

    expect(edges).toEqual([]);
  });

  it('表に出ている相手だけを結ぶ', () => {
    const { edges } = buildEdges([
      issue('a'),
      issue('b', { deps: [dep('a', 'blocks'), dep('gone', 'blocks')] }),
    ]);

    expect(edges).toHaveLength(1);
    expect(edges[0]).toMatchObject({ a: 0, b: 1, to: 1, type: 'blocks' });
  });

  /* 依存の向きをそのまま描くと、矢は「何を待っているか」を指す。読みたいのは着手の順である。 */
  it('矢を上から下へ辿ると、着手順になる', () => {
    const { edges } = buildEdges([issue('a'), issue('b', { deps: [dep('a', 'blocks')] })]);

    expect(edges[0]?.to, '矢じりは、堰き止めている `a` ではなく、待っている `b` の側に付く').toBe(
      1,
    );
  });

  it('待っている行が上に在っても、矢じりはその行の側に付く', () => {
    const { edges } = buildEdges([issue('b', { deps: [dep('a', 'blocks')] }), issue('a')]);

    expect(edges[0], '`to` は行の上下ではなく、依存を持っている行の添字である').toMatchObject({
      a: 0,
      b: 1,
      to: 0,
    });
  });

  it('重なる弧は別のトラックへ寄せる', () => {
    const { edges, lanes } = buildEdges([
      issue('a'),
      issue('b'),
      issue('c', { deps: [dep('a', 'blocks')] }),
      issue('d', { deps: [dep('b', 'blocks')] }),
    ]);

    expect(lanes).toBe(2);
    expect(new Set(edges.map((edge) => edge.lane)).size).toBe(2);
  });

  /* 読めない密度の弧は、描かないほうが正しい。 */
  it('トラックを使い切ったら、それ以上は描かない', () => {
    const rows = [
      ...Array.from({ length: 8 }, (_, index) => issue(`t${index}`)),
      ...Array.from({ length: 8 }, (_, index) =>
        issue(`s${index}`, { deps: [dep(`t${index}`, 'blocks')] }),
      ),
    ];

    const { lanes } = buildEdges(rows);

    expect(lanes).toBeLessThanOrEqual(6);
  });
});

describe('着手の順', () => {
  const rank = (issues: readonly Issue[], target: Issue) => startRanker(issues)(target);

  it('塞がれていない open が最も上', () => {
    const free = issue('a');

    expect(rank([free], free)).toBe(0);
  });

  it('生きている相手に塞がれていれば、下がる', () => {
    const blocker = issue('a');
    const blocked = issue('b', { deps: [dep('a', 'blocks')] });

    expect(rank([blocker, blocked], blocked)).toBe(1);
  });

  /* 閉じた相手はもう塞いでいない。塞がれたままにすると、取れる仕事が沈む。 */
  it('相手が閉じていれば、塞がれていない', () => {
    const done = issue('a', { status: 'closed' });
    const next = issue('b', { deps: [dep('a', 'blocks')] });

    expect(rank([done, next], next)).toBe(0);
  });

  /* open でも closed でもない状態は、GitHub が付けたものも含めて一括りにする。
     並び順を状態ごとに刻むと、知らない状態が来たときだけ順序が決まらない。 */
  it('open でも closed でもないものは、手を付けられるものの後ろ・閉じたものの前に来る', () => {
    const rows = [
      issue('b', { status: 'blocked' }),
      issue('n', { status: 'not_planned' }),
      issue('c', { status: 'closed' }),
    ];
    const ranker = startRanker(rows);

    expect(rows.map(ranker)).toEqual([3, 3, 5]);
  });
});

describe('束ねた課題の消化', () => {
  it('子の数と、閉じた子の数を数える', () => {
    const progress = childProgress([
      issue('c1', { deps: [dep('epic', 'parent-child')] }),
      issue('c2', { status: 'closed', deps: [dep('epic', 'parent-child')] }),
    ]);

    expect(progress.get('epic')).toEqual({ total: 2, closed: 1 });
  });

  it('親子以外の繋がりは数えない', () => {
    const progress = childProgress([issue('c1', { deps: [dep('epic', 'blocks')] })]);

    expect(progress.size).toBe(0);
  });
});

/* ホバーで残すのは「この課題と関わりのある行」であって、依存の向きではない。 */
describe('行どうしの繋がり', () => {
  const related = (index: ReturnType<typeof relatedIndex>, id: string) => [
    ...(index.get(id) ?? []),
  ];

  it('依存は両向きとも入る', () => {
    const index = relatedIndex([issue('a'), issue('b', { deps: [dep('a', 'blocks')] })]);

    expect(related(index, 'b')).toEqual(['a']);
    expect(related(index, 'a'), '向きで分けると、自分を待っている課題が沈む').toEqual(['b']);
  });

  /* 親子は階層で見せるが、繋がりであることに変わりはない。 */
  it('親子も繋がりとして残る', () => {
    const index = relatedIndex([issue('a'), issue('b', { deps: [dep('a', 'parent-child')] })]);

    expect(related(index, 'a')).toEqual(['b']);
  });

  it('一覧に出ていない相手は入らない', () => {
    const index = relatedIndex([issue('b', { deps: [dep('gone', 'blocks')] })]);

    expect(index.get('b'), '画面の外へは線を引かない').toBeUndefined();
    expect(index.get('gone')).toBeUndefined();
  });

  it('自分自身は入らない', () => {
    const index = relatedIndex([issue('a', { deps: [dep('a', 'blocks')] })]);

    expect(index.get('a'), '自分に繋がっていると、ホバーで一覧の何も絞れない').toBeUndefined();
  });

  it('相手が複数居ても、取りこぼさない', () => {
    const index = relatedIndex([
      issue('a'),
      issue('b', { deps: [dep('a', 'blocks')] }),
      issue('c', { deps: [dep('a', 'parent-child')] }),
    ]);

    expect(related(index, 'a').sort()).toEqual(['b', 'c']);
  });
});
