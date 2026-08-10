import { describe, expect, it } from 'vitest';
import {
  containsPath,
  isSafeAbsolutePath,
  overlapsPath,
  pathBasename,
  pathDepth,
} from '~/app-kernel/path.ts';

describe('パスとして使える名前か', () => {
  it('絶対名だけを通す', () => {
    expect(isSafeAbsolutePath('/Users/x/src/foo')).toBe(true);
    expect(
      isSafeAbsolutePath('src/foo'),
      '相対名は、書いた側の作業ディレクトリでしか意味を持たない',
    ).toBe(false);
    expect(isSafeAbsolutePath('.')).toBe(false);
    expect(isSafeAbsolutePath('')).toBe(false);
  });

  it('区切りに使えない文字が混じったものを断る', () => {
    expect(isSafeAbsolutePath('/Users/x/\0/etc/passwd')).toBe(false);
  });
});

describe('パスの重なり', () => {
  it('同じパスは含む', () => {
    expect(containsPath('/a/b', '/a/b')).toBe(true);
  });

  it('中にあるものを含む', () => {
    expect(containsPath('/a/b', '/a/b/c')).toBe(true);
    expect(containsPath('/a/b', '/a/b/c/d.jsonl')).toBe(true);
  });

  it('名前の頭が同じだけの隣を、中にあると見なさない', () => {
    // ここが緩むと、隣のプロジェクトの中身がこちらのパスの内側として読めてしまう
    expect(containsPath('/a/b', '/a/bc')).toBe(false);
    expect(containsPath('/a/b', '/a/b-other')).toBe(false);
    expect(containsPath('/repo', '/repository/secret')).toBe(false);
  });

  it('外にあるものは含まない', () => {
    expect(containsPath('/a/b', '/a')).toBe(false);
    expect(containsPath('/a/b', '/x/y')).toBe(false);
  });

  it('`..` を含むパスは、正規化してから見る', () => {
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

  it('向きを問わない見方は、プロジェクトの一部から起動されたときのためにある', () => {
    // エージェントは worktree の中で働くことがあるので、記録に残る作業ディレクトリがプロジェクトの一部になる
    expect(overlapsPath('/a/b', '/a/b/.worktrees/x')).toBe(true);
    expect(overlapsPath('/a/b/.worktrees/x', '/a/b')).toBe(true);
    expect(overlapsPath('/a/b', '/a/bc')).toBe(false);
  });
});

describe('パスの深さ', () => {
  it('区切りで割った、空でない名前を数える', () => {
    expect(pathDepth('/a/b/c')).toBe(3);
    expect(pathDepth('/a')).toBe(1);
  });

  it('根は 0', () => {
    expect(pathDepth('/'), '根はどのプロジェクトより浅いので、他に候補が有ればそちらが勝つ').toBe(
      0,
    );
  });

  it('末尾の区切りや重なった区切りで深さは変わらない', () => {
    expect(pathDepth('/a/b/')).toBe(2);
    expect(pathDepth('/a//b')).toBe(2);
  });

  it('`..` を含むパスは正規化してから数える', () => {
    // ここが緩むと、表記の長い浅いプロジェクトが、本当に深いプロジェクトより深いことになる
    expect(pathDepth('/a/x/../b')).toBe(2);
    expect(pathDepth('/a/./b')).toBe(2);
  });

  it('含むかの見方と、同じ正規化をする', () => {
    // containsPath が中と見なすパスは、正規化した後の深さで測られる
    expect(containsPath('/a/x/../b', '/a/b/c')).toBe(true);
    expect(pathDepth('/a/x/../b')).toBeLessThan(pathDepth('/a/b/c'));
  });

  it('空の名前は 0', () => {
    expect(pathDepth('')).toBe(0);
  });
});

describe('パスの末尾の名前', () => {
  it('最後の区切りより後を返す', () => {
    expect(pathBasename('/work/myproj')).toBe('myproj');
    expect(pathBasename('/work/myproj/')).toBe('myproj');
    expect(pathBasename('/myproj')).toBe('myproj');
  });

  it('名前の無いパスでは空を返す', () => {
    expect(pathBasename('/'), '根にはベース名が無い').toBe('');
    expect(pathBasename('')).toBe('');
  });
});
