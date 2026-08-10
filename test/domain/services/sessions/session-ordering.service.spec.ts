import { describe, expect, it } from 'vitest';
import {
  sortByLastActivityDesc,
  sortByLatestActivityDesc,
} from '~/domain/services/sessions/session-ordering.service.ts';

describe('セッションと子を新しい順に並べる', () => {
  it('最も新しく動いたものが先に来る', () => {
    const sorted = sortByLastActivityDesc([
      { id: 'a', lastActivityMs: 10 },
      { id: 'b', lastActivityMs: 30 },
      { id: 'c', lastActivityMs: 20 },
    ]);
    expect(
      sorted.map((s) => s.id),
      'ユーザーが最初に見たいのは、いま動いているもの',
    ).toEqual(['b', 'c', 'a']);
  });

  it('受け取った配列を壊さない', () => {
    const items = [
      { id: 'a', lastActivityMs: 10 },
      { id: 'b', lastActivityMs: 30 },
    ];
    sortByLastActivityDesc(items);
    expect(
      items.map((s) => s.id),
      '呼ぶ側が同じ配列を別の見方でもう一度使える',
    ).toEqual(['a', 'b']);
  });

  it('同じ値のものは元の順を保つ', () => {
    const sorted = sortByLastActivityDesc([
      { id: 'a', lastActivityMs: 10 },
      { id: 'b', lastActivityMs: 10 },
      { id: 'c', lastActivityMs: 10 },
    ]);
    expect(
      sorted.map((s) => s.id),
      '測れない差を並びで作らない',
    ).toEqual(['a', 'b', 'c']);
  });

  it('何も無ければ空の配列を返す', () => {
    expect(sortByLastActivityDesc([])).toEqual([]);
  });
});

describe('プロジェクトを新しい順に並べる', () => {
  it('最も新しく動いたプロジェクトが先に来る', () => {
    const sorted = sortByLatestActivityDesc([
      { id: 'a', latestActivityMs: 10 },
      { id: 'b', latestActivityMs: 30 },
      { id: 'c', latestActivityMs: 20 },
    ]);
    expect(sorted.map((p) => p.id)).toEqual(['b', 'c', 'a']);
  });

  it('受け取った配列を壊さない', () => {
    const items = [
      { id: 'a', latestActivityMs: 10 },
      { id: 'b', latestActivityMs: 30 },
    ];
    sortByLatestActivityDesc(items);
    expect(
      items.map((p) => p.id),
      '呼ぶ側が同じ配列を別の見方でもう一度使える',
    ).toEqual(['a', 'b']);
  });

  it('同じ値のものは元の順を保つ', () => {
    const sorted = sortByLatestActivityDesc([
      { id: 'a', latestActivityMs: 5 },
      { id: 'b', latestActivityMs: 5 },
    ]);
    expect(
      sorted.map((p) => p.id),
      '測れない差を並びで作らない',
    ).toEqual(['a', 'b']);
  });

  it('何も無ければ空の配列を返す', () => {
    expect(sortByLatestActivityDesc([])).toEqual([]);
  });
});
