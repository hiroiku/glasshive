import { describe, expect, it } from 'vitest';
import {
  containsPath,
  isSafeAbsolutePath,
  overlapsPath,
  pathBasename,
  pathDepth,
} from '~/app-kernel/path.ts';

describe('場所として使える名前か', () => {
  it('絶対名だけを通す', () => {
    expect(isSafeAbsolutePath('/Users/x/src/foo')).toBe(true);
    expect(isSafeAbsolutePath('src/foo'), '相対名は、書いた側の居場所でしか意味を持たない').toBe(
      false,
    );
    expect(isSafeAbsolutePath('.')).toBe(false);
    expect(isSafeAbsolutePath('')).toBe(false);
  });

  it('区切りに使えない字が混じったものを断る', () => {
    expect(isSafeAbsolutePath('/Users/x/\0/etc/passwd')).toBe(false);
  });
});

describe('場所の重なり', () => {
  it('同じ場所は含む', () => {
    expect(containsPath('/a/b', '/a/b')).toBe(true);
  });

  it('中にあるものを含む', () => {
    expect(containsPath('/a/b', '/a/b/c')).toBe(true);
    expect(containsPath('/a/b', '/a/b/c/d.jsonl')).toBe(true);
  });

  it('名前の頭が同じだけの隣を、中にあると見なさない', () => {
    // ここが緩むと、隣の巣の中身がこちらの名前で読める
    expect(containsPath('/a/b', '/a/bc')).toBe(false);
    expect(containsPath('/a/b', '/a/b-other')).toBe(false);
    expect(containsPath('/repo', '/repository/secret')).toBe(false);
  });

  it('外にあるものは含まない', () => {
    expect(containsPath('/a/b', '/a')).toBe(false);
    expect(containsPath('/a/b', '/x/y')).toBe(false);
  });

  it('遡る道は、畳んでから見る', () => {
    expect(containsPath('/a/b', '/a/b/../../etc/passwd')).toBe(false);
    expect(containsPath('/a/b', '/a/b/c/../d')).toBe(true);
  });

  it('末尾の区切りが有っても無くても同じに見る', () => {
    expect(containsPath('/a/b/', '/a/b/c')).toBe(true);
    expect(containsPath('/a/b/', '/a/bc')).toBe(false);
  });

  it('空の名前はどちらの向きにも含まない', () => {
    expect(containsPath('', '/a')).toBe(false);
    expect(containsPath('/a', '')).toBe(false);
  });

  it('向きを問わない見方は、巣の一部から起動されたときのためにある', () => {
    // エージェントは連結された作業領域の中で働くので、記録に残る場所が巣の一部になる
    expect(overlapsPath('/a/b', '/a/b/.worktrees/x')).toBe(true);
    expect(overlapsPath('/a/b/.worktrees/x', '/a/b')).toBe(true);
    expect(overlapsPath('/a/b', '/a/bc')).toBe(false);
  });
});

describe('場所の深さ', () => {
  it('区切りで割った、空でない名前を数える', () => {
    expect(pathDepth('/a/b/c')).toBe(3);
    expect(pathDepth('/a')).toBe(1);
  });

  it('根は 0', () => {
    expect(pathDepth('/'), '根はどの巣より浅いので、他に当てが有ればそちらが勝つ').toBe(0);
  });

  it('末尾の区切りや重なった区切りで深さは変わらない', () => {
    expect(pathDepth('/a/b/')).toBe(2);
    expect(pathDepth('/a//b')).toBe(2);
  });

  it('遡る道は畳んでから数える', () => {
    // ここが緩むと、字面の長い浅い巣が、本当に深い巣より深いことになる
    expect(pathDepth('/a/x/../b')).toBe(2);
    expect(pathDepth('/a/./b')).toBe(2);
  });

  it('含むかの見方と、同じ畳み方をする', () => {
    // containsPath が中と見なす場所は、畳んだ後の深さで測られる
    expect(containsPath('/a/x/../b', '/a/b/c')).toBe(true);
    expect(pathDepth('/a/x/../b')).toBeLessThan(pathDepth('/a/b/c'));
  });

  it('空の名前は 0', () => {
    expect(pathDepth('')).toBe(0);
  });
});

describe('場所の末尾の名前', () => {
  it('最後の区切りより後を返す', () => {
    expect(pathBasename('/work/myproj')).toBe('myproj');
    expect(pathBasename('/work/myproj/')).toBe('myproj');
    expect(pathBasename('/myproj')).toBe('myproj');
  });

  it('名前の無い場所では空を返す', () => {
    expect(pathBasename('/'), '根には呼び名が無い').toBe('');
    expect(pathBasename('')).toBe('');
  });
});
