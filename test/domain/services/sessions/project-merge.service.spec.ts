import { describe, expect, it } from 'vitest';
import {
  type MergeableProject,
  mergeProjects,
} from '~/domain/services/sessions/project-merge.service.ts';

const raw = (
  slug: string,
  canonicalPath: string | null,
  latestActivityMs: number,
  sessions: readonly string[] = [],
  path: string | null = canonicalPath,
): MergeableProject<string> => ({
  slug,
  path,
  canonicalPath,
  latestActivityMs,
  sessions,
});

describe('同じ実体のプロジェクトを 1 つに併せる', () => {
  it('解決済みのパスが同じなら、名前が違っても併さる', () => {
    const merged = mergeProjects([
      raw('-Users-x-repo', '/Users/x/repo', 10, ['a'], '/Users/x/repo'),
      raw('-System-Volumes-Data-Users-x-repo', '/Users/x/repo', 20, ['b'], '/System/Volumes/x'),
    ]);
    expect(merged).toHaveLength(1);
    expect(merged[0]?.slugs, '併せた元の名前は残す').toEqual([
      '-System-Volumes-Data-Users-x-repo',
      '-Users-x-repo',
    ]);
  });

  it('代表は辞書順で最も小さい名前の持ち主', () => {
    const merged = mergeProjects([
      raw('-b-repo', '/r', 10, ['a'], '/b/repo'),
      raw('-a-repo', '/r', 20, ['b'], '/a/repo'),
    ]);
    expect(merged[0]?.id, '読む順で代表が変わると、同じ観測が二度と再現しない').toBe('-a-repo');
    expect(merged[0]?.path, 'パスも代表のものを採る').toBe('/a/repo');
    expect(merged[0]?.canonicalPath).toBe('/r');
  });

  it('併せた名前は辞書順に並べて返す', () => {
    const merged = mergeProjects([raw('-c', '/r', 1), raw('-a', '/r', 1), raw('-b', '/r', 1)]);
    expect(merged[0]?.slugs).toEqual(['-a', '-b', '-c']);
  });

  it('パスがまったく分からないものは、名前が違えば併さらない', () => {
    const merged = mergeProjects([raw('-a', null, 10, [], null), raw('-b', null, 20, [], null)]);
    expect(merged, 'パスが分からないもの同士を同じ実体と見なす根拠は無い').toHaveLength(2);
    expect(merged.map((m) => m.id)).toEqual(['-a', '-b']);
  });

  it('解決に失敗しても、生のパスが同じなら併さる', () => {
    const merged = mergeProjects([
      raw('-b', null, 10, ['x'], '/Users/x/repo'),
      raw('-a', null, 20, ['y'], '/Users/x/repo'),
    ]);
    expect(
      merged,
      '解決の失敗は「表記の揺れを正規化できなかった」だけで、「パスが分からない」ではない',
    ).toHaveLength(1);
    expect(merged[0]?.slugs).toEqual(['-a', '-b']);
  });

  it('解決に失敗したものも、解決済みの同じパスと併さる', () => {
    const merged = mergeProjects([
      raw('-a', null, 10, ['x'], '/Users/x/repo'),
      raw('-b', '/Users/x/repo', 20, ['y'], '/System/Volumes/Data/Users/x/repo'),
    ]);
    expect(merged, '片方だけ解決できたからといって、別の実体になるわけではない').toHaveLength(1);
    expect(merged[0]?.sessions).toEqual(['x', 'y']);
    expect(merged[0]?.canonicalPath, '代表が解決できていなくても、組を作ったパスは残る').toBe(
      '/Users/x/repo',
    );
  });

  it('帰属に使うパスは、代表が入れ替わっても動かない', () => {
    // 代表は名前の辞書順で決まるので、`-S` の側が代表になり path はそちらの表記になる。
    // ここで帰属まで代表の path で測ると、OS が教えるパスと噛み合わなくなる。
    const merged = mergeProjects([
      raw('-Users-x-repo', '/Users/x/repo', 10, ['a'], '/Users/x/repo'),
      raw('-System-Volumes-Data-Users-x-repo', '/Users/x/repo', 20, ['b'], '/System/Volumes/x'),
    ]);
    expect(merged[0]?.path, '見せる表記は代表のもの').toBe('/System/Volumes/x');
    expect(merged[0]?.canonicalPath, '測るためのパスは組のもの').toBe('/Users/x/repo');
  });

  it('生のパスが違えば、解決できていなくても併さらない', () => {
    const merged = mergeProjects([
      raw('-a', null, 10, [], '/Users/x/one'),
      raw('-b', null, 20, [], '/Users/x/two'),
    ]);
    expect(merged).toHaveLength(2);
  });

  it('解決済みのパスが無くても、名前が同じなら併さる', () => {
    const merged = mergeProjects([raw('-a', null, 10, ['x']), raw('-a', null, 20, ['y'])]);
    expect(merged).toHaveLength(1);
    expect(merged[0]?.sessions).toEqual(['x', 'y']);
  });

  it('直近の動きは、組の中で最も新しいものを採る', () => {
    const merged = mergeProjects([
      raw('-a', '/r', 30, ['x']),
      raw('-b', '/r', 10, ['y']),
      raw('-c', '/r', 20, ['z']),
    ]);
    expect(
      merged[0]?.latestActivityMs,
      '併せたプロジェクトは、どれか 1 つでも動いていれば動いている',
    ).toBe(30);
  });

  it('セッションは連結するだけで、並べ替えない', () => {
    const merged = mergeProjects([raw('-b', '/r', 1, ['b1', 'b2']), raw('-a', '/r', 1, ['a1'])]);
    expect(merged[0]?.sessions, '並べ直しは呼ぶ側の仕事なので、ここでは順を触らない').toEqual([
      'b1',
      'b2',
      'a1',
    ]);
  });

  it('出てくる順は、最初に現れた組の順を保つ', () => {
    const merged = mergeProjects([
      raw('-z', '/z', 1),
      raw('-m', '/m', 1),
      raw('-a', '/z', 1),
      raw('-b', '/b', 1),
    ]);
    expect(
      merged.map((m) => m.canonicalPath),
      '代表が入れ替わっても、組そのものの位置は動かさない',
    ).toEqual(['/z', '/m', '/b']);
  });

  it('名前とパスはキーの空間を分けて測る', () => {
    const merged = mergeProjects([raw('/r', null, 1), raw('-a', '/r', 1)]);
    expect(merged, '文字列がたまたま同じでも、名前とパスは別のものである').toHaveLength(2);
  });

  it('受け取った配列を壊さない', () => {
    const raws = [raw('-b', '/r', 1, ['x']), raw('-a', '/r', 2, ['y'])];
    const before = raws.map((r) => r.slug);
    const merged = mergeProjects(raws);
    expect(
      raws.map((r) => r.slug),
      '呼ぶ側が同じ配列をもう一度使える',
    ).toEqual(before);
    expect(raws[0]?.sessions).toEqual(['x']);
    expect(merged[0]?.sessions).toEqual(['x', 'y']);
  });

  it('何も無ければ空の配列を返す', () => {
    expect(mergeProjects([])).toEqual([]);
  });
});
