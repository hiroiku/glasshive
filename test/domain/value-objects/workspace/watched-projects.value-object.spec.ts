import { describe, expect, it } from 'vitest';
import {
  parsePinnedIds,
  parseWatchedProjects,
} from '~/domain/value-objects/workspace/watched-projects.value-object.ts';

/* `preferences.json` を、記録として読めるときだけ記録にする。

   読めなかったものは「読めるものが無い」に倒す。倒れても観測は 1 つも欠けない ——
   記録が「まだ何も観ていない」に見えるだけである。 */

const document = (value: unknown): string => JSON.stringify(value);

describe('記録を読む', () => {
  it('バージョンと欄が揃っていれば読む', () => {
    expect(parseWatchedProjects(document({ version: 2, watched: ['/src/a', '/src/b'] }))).toEqual({
      version: 2,
      paths: ['/src/a', '/src/b'],
    });
  });

  /* この先は全部、絶対パスであることを前提にした突き合わせである。 */
  it('絶対パスでないものは落とす', () => {
    expect(
      parseWatchedProjects(document({ version: 2, watched: ['src/a', '/src/b', ''] })),
    ).toEqual({ version: 2, paths: ['/src/b'] });
  });

  it.each([
    ['壊れた文字列', 'not json'],
    ['配列', document(['/src/a'])],
    ['バージョンが違う', document({ version: 1, watched: ['/src/a'] })],
    ['欄が無い', document({ version: 2 })],
    ['文字列でない要素が混じる', document({ version: 2, watched: ['/src/a', 3] })],
  ])('%s は、読めるものが無いとして扱う', (_name, text) => {
    expect(parseWatchedProjects(text)).toBe(undefined);
  });

  it('`__proto__` に書かれた欄は、記録の欄にならない', () => {
    expect(parseWatchedProjects('{"version": 2, "__proto__": {"watched": ["/src/a"]}}')).toBe(
      undefined,
    );
  });

  /* 素のプロパティ参照はプロトタイプまで拾う。他所が `Object.prototype` に欄を生やしていると、
     欄の無い `preferences.json` が「欄の揃った記録」に見え、書いた覚えのない記録が読める。 */
  it('自分で持っていない欄は読まない', () => {
    const prototype = Object.prototype as unknown as Record<string, unknown>;
    prototype.watched = ['/src/どこか'];
    try {
      expect(parseWatchedProjects('{"version": 2}')).toBe(undefined);
    } finally {
      delete prototype.watched;
    }
  });
});

/* 1 つ前の形。留めていたのは id で、パスは持っていない。読めても、そのままでは記録に
   ならない —— 観測の側で読み替えられたものだけが引き継がれる。 */
describe('前の形のピン留めを読む', () => {
  it('留めていた id を並びのまま返す', () => {
    expect(parsePinnedIds(document({ version: 1, mode: 'all', pinned: ['-w-a', '-w-b'] }))).toEqual(
      ['-w-a', '-w-b'],
    );
  });

  it('今の形からは読まない', () => {
    expect(parsePinnedIds(document({ version: 2, watched: ['/src/a'] }))).toBe(undefined);
  });
});
