import { describe, expect, it } from 'vitest';
import {
  buildEdges,
  buildHierarchy,
  childProgress,
  startRanker,
} from '~/frameworks/tanstack/ui/derive/issueTree.ts';

/* 課題どうしの繋がりを、一列に並べた行の上で表す。

   **親子は階層、それ以外は弧。** 混ぜると、ほとんどの課題に親が居るせいで
   余白が親子の弧で埋まり、どれが本当の依存か読めなくなる。 */

/* 課題の形は、畳む役自身から引く。ここは外の層の名前を見に行けないし、
   写して持てば、形が変わったときに片方だけ古いまま残る。 */
type Issue = Parameters<typeof buildHierarchy>[0][number];
type Dep = Issue['deps'][number];

const issue = (id: string, over: Partial<Issue> = {}): Issue => ({
  id,
  title: id,
  status: 'open',
  priority: 2,
  issue_type: 'task',
  labels: [],
  assignee: null,
  owner: null,
  created_at: null,
  updated_at: null,
  deps: [],
  ...over,
});

const dep = (on: string, type: string): Dep => ({ on, type });

describe('親子を階層に畳む', () => {
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

  /* 親子が輪になっていると、根から辿っても出てこない。落とすと行が画面から消える。 */
  it('親子が輪になっていても、行を落とさない', () => {
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
    expect(edges[0]).toMatchObject({ a: 0, b: 1, to: 0, type: 'blocks' });
  });

  it('重なる弧は別の筋へ寄せる', () => {
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
  it('筋を使い切ったら、それ以上は描かない', () => {
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

  it('着手済み・統合待ち・見送り・閉じたもの、の順に下がる', () => {
    const rows = [
      issue('p', { status: 'in_progress' }),
      issue('m', { status: 'merge-ready' }),
      issue('d', { status: 'deferred' }),
      issue('c', { status: 'closed' }),
    ];
    const ranker = startRanker(rows);

    expect(rows.map(ranker)).toEqual([2, 3, 4, 5]);
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
