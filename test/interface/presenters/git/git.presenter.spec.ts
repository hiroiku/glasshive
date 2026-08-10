import { describe, expect, it } from 'vitest';
import { AppError } from '~/app-kernel/error.ts';
import { absent, observed, unobservable } from '~/app-kernel/observation.ts';
import { err, ok } from '~/app-kernel/result.ts';
import { presentGitOverview, presentRefDetail } from '~/interface/presenters/git/git.presenter.ts';

/* 変換の仕方はエラーコードでしか決まらない。だから内側のエラー型は持ち込まず、
   エラーコードだけを載せたエラーを起こして確かめる。 */
class GitFailure extends AppError {
  readonly code: string;

  constructor(code: string, message = 'テストで起こした失敗') {
    super(message);
    this.code = code;
  }
}

const OVERVIEW = {
  base: 'main',
  worktrees: [{ path: '/work/hive', branch: 'main', sha: '9f8e7d6c5b', detached: false }],
  branches: [
    {
      name: 'topic',
      sha: 'def5678',
      date: '2026-08-03T10:00:00+09:00',
      subject: 'git を移す',
      head: false,
    },
  ],
  mainline: [
    {
      sha: '9f8e7d6c5b',
      merge: true,
      date: '2026-08-04T10:00:00+09:00',
      subject: '土台を置く',
    },
  ],
  tips: [
    {
      kind: 'branch' as const,
      name: 'topic',
      sha: 'def5678',
      date: '2026-08-03T10:00:00+09:00',
      subject: 'git を移す',
      worktree: null,
      mergeBase: '9f8e7d6c5b',
      ahead: 3,
      behind: 1,
    },
  ],
  /* 重なりの本数と、挙げるファイルの本数は別のものである。**同じ数を置くと、
     一覧の長さを本数として写しても気付けない。** 6 本より多く重なった組がどれも
     「6 本」に見えるようになるが、変換のテストは通ってしまう。 */
  conflicts: [
    {
      a: 'topic',
      b: 'hive-x',
      count: 9,
      files: ['src/a.ts', 'src/b.ts', 'src/c.ts', 'src/d.ts', 'src/e.ts', 'src/f.ts'],
    },
  ],
};

const DETAIL = {
  rev: 'topic',
  base: 'main',
  unique: true,
  commits: [
    {
      sha: 'abc1234',
      date: '2026-08-04T10:00:00+09:00',
      author: 'hiroiku',
      subject: 'git を移す',
    },
  ],
  stat: { files: 2, add: 13, del: 3 },
  behind: 2,
  files: [{ path: 'src/a.ts', add: 12, del: 3 }],
};

describe('観測できたとき', () => {
  it('外部 API の名前で写す', () => {
    const presented = presentGitOverview(ok(observed(OVERVIEW)));
    expect(presented.status).toBe(200);
    expect(presented.body, '内側の名前をそのまま出すと、受け取る側が二通りの形を覚える').toEqual({
      state: 'observed',
      reason: null,
      base: 'main',
      worktrees: [
        {
          path: '/work/hive',
          branch: 'main',
          sha: '9f8e7d6c5b',
          detached: false,
        },
      ],
      branches: [
        {
          name: 'topic',
          sha: 'def5678',
          date: '2026-08-03T10:00:00+09:00',
          subject: 'git を移す',
          head: false,
        },
      ],
      mainline: [
        {
          sha: '9f8e7d6c5b',
          merge: true,
          date: '2026-08-04T10:00:00+09:00',
          subject: '土台を置く',
        },
      ],
      tips: [
        {
          kind: 'branch',
          name: 'topic',
          sha: 'def5678',
          date: '2026-08-03T10:00:00+09:00',
          subject: 'git を移す',
          worktree: null,
          merge_base: '9f8e7d6c5b',
          ahead: 3,
          behind: 1,
        },
      ],
      conflicts: [
        {
          a: 'topic',
          b: 'hive-x',
          n: 9,
          files: ['src/a.ts', 'src/b.ts', 'src/c.ts', 'src/d.ts', 'src/e.ts', 'src/f.ts'],
        },
      ],
    });
  });

  it('`ref` の詳しい姿も写す', () => {
    const presented = presentRefDetail(ok(observed(DETAIL)));
    expect(presented.status).toBe(200);
    expect(presented.body).toEqual({
      state: 'observed',
      reason: null,
      rev: 'topic',
      base: 'main',
      unique: true,
      commits: [
        {
          sha: 'abc1234',
          date: '2026-08-04T10:00:00+09:00',
          author: 'hiroiku',
          subject: 'git を移す',
        },
      ],
      stat: { files: 2, add: 13, del: 3 },
      behind: 2,
      files: [{ path: 'src/a.ts', add: 12, del: 3 }],
    });
  });
});

describe('観測はできたが、無かったとき', () => {
  it('そこがリポジトリでないのは 200 と空の値', () => {
    const presented = presentGitOverview(ok(absent('no-source')));
    expect(
      presented.status,
      '404 にすると、git がインストールされていない機械ですべてのプロジェクトが消えたように見える',
    ).toBe(200);
    expect(presented.body, '欄はすべて在るまま空にする。形が二通りあると読む側が迷う').toEqual({
      state: 'absent',
      reason: 'no-source',
      base: '',
      worktrees: [],
      branches: [],
      mainline: [],
      tips: [],
      conflicts: [],
    });
  });

  it('そんな `ref` が無いのも 200 と空の値', () => {
    const presented = presentRefDetail(ok(absent('no-source')));
    expect(presented.status, '求めた側に落ち度は無い').toBe(200);
    expect(presented.body).toEqual({
      state: 'absent',
      reason: 'no-source',
      rev: '',
      base: null,
      unique: false,
      commits: [],
      stat: null,
      behind: 0,
      files: [],
    });
  });
});

describe('観測できなかったとき', () => {
  it('`git` が無いときは 503', () => {
    const presented = presentGitOverview(ok(unobservable(new GitFailure('git.not_installed'))));
    expect(presented.status, 'もう一度求めれば通るかもしれない側の失敗である').toBe(503);
    expect(presented.body, 'エラーコードはそのまま外へ出す').toEqual({
      state: 'unobservable',
      code: 'git.not_installed',
      message: 'テストで起こした失敗',
    });
  });
});

describe('断ったとき', () => {
  it('`ref` の形が違うのは 400', () => {
    const presented = presentRefDetail(
      err(new GitFailure('git.invalid_revision', '指しとして使えない形である')),
    );
    expect(
      presented.status,
      'リクエストの側の誤りを 503 にすると、直らないリクエストを叩き続けさせる',
    ).toBe(400);
    expect(presented.body, '観測できなかったのではなく、観測しに行かないと決めたのである').toEqual({
      state: 'invalid',
      code: 'git.invalid_revision',
      message: '指しとして使えない形である',
    });
  });

  it('概要の側でも、断りは断りとして写す', () => {
    const presented = presentGitOverview(
      err(new GitFailure('git.invalid_revision', '指しとして使えない形である')),
    );
    expect(
      presented.status,
      '受理しなかったリクエストを 200 で返すと、空のプロジェクトとして読まれる',
    ).toBe(400);
    expect(presented.body).toEqual({
      state: 'invalid',
      code: 'git.invalid_revision',
      message: '指しとして使えない形である',
    });
  });
});
