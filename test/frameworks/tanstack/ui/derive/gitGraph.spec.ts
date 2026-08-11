import { describe, expect, it } from 'vitest';
import { buildRows, layoutOf, sortTips } from '~/frameworks/tanstack/ui/derive/gitGraph.ts';

/* `git` のブランチと本流を、縦に並ぶ行へ組み直す。

   **折り畳むのは本流だけ。** 生きている線はどれも「いま誰かが立っている場所」なので、
   折り畳むと画面から人が消える。 */

/* 形は、組み直す実装そのものから引く。写して持てば、形が変わったときに片方だけ古いまま残る */
type MainNode = Parameters<typeof buildRows>[0][number];
type Tip = Parameters<typeof buildRows>[1][number];

const node = (sha: string, over: Partial<MainNode> = {}): MainNode => ({
  sha,
  merge: false,
  date: '2026-08-09T12:00:00Z',
  subject: sha,
  ...over,
});

const tip = (name: string, over: Partial<Tip> = {}): Tip => ({
  kind: 'branch',
  name,
  sha: `sha-${name}`,
  date: '2026-08-09T12:00:00Z',
  subject: name,
  worktree: null,
  merge_base: 'base',
  ahead: 1,
  behind: 0,
  ...over,
});

describe('本流を折り畳む', () => {
  it('生きている線を先に並べ、その下に本流を置く', () => {
    const rows = buildRows([node('a')], [tip('x', { merge_base: 'a' })]);

    expect(rows.map((row) => row.type)).toEqual(['tip', 'node']);
  });

  /* 分かれ目が消えると、線が宙で終わる。 */
  it('マージ・分かれ目・先頭は折り畳まない', () => {
    const rows = buildRows(
      [node('head'), node('plain'), node('fork'), node('merged', { merge: true })],
      [tip('x', { merge_base: 'fork' })],
    );

    const kept = rows.filter((row) => row.type === 'node').map((row) => row.node.sha);
    expect(kept).toEqual(['head', 'fork', 'merged']);
  });

  it('折り畳んだぶんは 1 行にまとめ、本数を持つ', () => {
    const rows = buildRows(
      [node('head'), node('p1'), node('p2'), node('merged', { merge: true })],
      [],
    );

    const folds = rows.filter((row) => row.type === 'fold');
    expect(folds).toHaveLength(1);
    expect(folds[0]?.count).toBe(2);
  });

  /* 位置で名指すと、上の行が 1 つ増減しただけで別の塊として組み直される。 */
  it('折り畳んだ塊は、その中の最初のコミットで名指せる', () => {
    const rows = buildRows([node('head'), node('p1'), node('p2')], []);

    expect(rows.find((row) => row.type === 'fold')?.from).toBe('p1');
  });
});

describe('線の合流先を決める', () => {
  it('分かれ目の行を指す', () => {
    const layout = layoutOf([node('head'), node('fork')], [tip('x', { merge_base: 'fork' })]);

    expect(layout.firstMain).toBe(1);
    expect(layout.baseIndex.get(0), '線 1 本、本流 2 行なので 3 行目が分かれ目').toBe(2);
  });

  /* 遡る数の上限より古い分かれ目は本流に出てこない。途中で切ると、線が宙で終わる。 */
  it('分かれ目が見当たらなければ、最後の行まで引く', () => {
    const layout = layoutOf([node('head')], [tip('x', { merge_base: 'どこにも無い' })]);

    expect(layout.baseIndex.get(0)).toBe(layout.rows.length - 1);
  });

  /* 引いた先を分かれ目として読ませると、300 コミット前に分かれたブランチが
     いちばん古い見えているコミットで分かれたように見える。 */
  it('見当たらなかった行は、そこで分かれたのではないと残す', () => {
    const layout = layoutOf([node('head')], [tip('x', { merge_base: 'どこにも無い' })]);

    expect(layout.unseenBase.has(0), '描く側がこれを見て、当てで引いた線だと言える').toBe(true);
  });

  it('分かれ目が見えている行には残さない', () => {
    const layout = layoutOf([node('head'), node('fork')], [tip('x', { merge_base: 'fork' })]);

    expect(
      layout.unseenBase.has(0),
      '見えている分かれ目にまで目印を出すと、その目印は誰にも読まれなくなる',
    ).toBe(false);
  });

  it('トラックの数だけ幅を取る', () => {
    const narrow = layoutOf([node('head')], [tip('x')]);
    const wide = layoutOf([node('head')], [tip('x'), tip('y')]);

    expect(wide.width).toBeGreaterThan(narrow.width);
  });
});

describe('生きている線を並べ替える', () => {
  it('名前で並べる', () => {
    const sorted = sortTips([tip('b'), tip('a')], 'name', 'asc');

    expect(sorted.map((row) => row.name)).toEqual(['a', 'b']);
  });

  it('進んでいる数で並べる', () => {
    const sorted = sortTips([tip('a', { ahead: 1 }), tip('b', { ahead: 9 })], 'ahead', 'desc');

    expect(sorted.map((row) => row.name)).toEqual(['b', 'a']);
  });

  it('時刻の読めない線も落とさない', () => {
    const sorted = sortTips([tip('a', { date: null }), tip('b')], 'date', 'desc');

    expect(sorted).toHaveLength(2);
  });

  it('渡された並びそのものは変えない', () => {
    const tips = [tip('b'), tip('a')];
    sortTips(tips, 'name', 'asc');

    expect(tips.map((row) => row.name)).toEqual(['b', 'a']);
  });
});
