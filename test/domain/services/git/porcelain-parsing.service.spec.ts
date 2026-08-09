import { describe, expect, it } from 'vitest';
import {
  parseBranchNames,
  parseBranchRefs,
  parseChangedPaths,
  parseCommitLog,
  parseMainline,
  parseNumstat,
  parseWorktreeList,
} from '~/domain/services/git/porcelain-parsing.service.ts';

/* 字面は git の答えを写したものを手で書く。**git も、ファイルも要らない。**
   読み解きが字と数だけで決まる限り、確かめもそれだけで足りる。 */

const NUL = '\0';

describe('worktree list --porcelain', () => {
  const OUTPUT = [
    'worktree /work/hive',
    'HEAD 9f8e7d6c5b4a39281706f5e4d3c2b1a098765432',
    'branch refs/heads/main',
    '',
    'worktree /work/hive-topic',
    'HEAD 1122334455667788990011223344556677889900',
    'detached',
    '',
  ].join('\n');

  it('場所ごとに切り分ける', () => {
    expect(
      parseWorktreeList(OUTPUT).map((worktree) => worktree.path),
      'worktree の行が次の場所の始まりで、そこを見誤ると別の場所の枝を混ぜる',
    ).toEqual(['/work/hive', '/work/hive-topic']);
  });

  it('枝の名から refs/heads/ を剥がす', () => {
    expect(
      parseWorktreeList(OUTPUT)[0]?.branch,
      '剥がさないと、枝の一覧に出る名と突き合わせられない',
    ).toBe('main');
  });

  it('sha は短くする', () => {
    expect(parseWorktreeList(OUTPUT)[0]?.sha, '40 桁はどれも似て見えて、人が見分けられない').toBe(
      '9f8e7d6c5b',
    );
  });

  it('記録を直に指している場所に印を付ける', () => {
    const detached = parseWorktreeList(OUTPUT)[1];
    expect(detached?.detached, '枝を持たない線は、印が無いと二度と見つからない').toBe(true);
    expect(detached?.branch, '枝は出していない').toBe(null);
  });

  it('答えが空なら 1 つも作らない', () => {
    expect(
      parseWorktreeList(''),
      'そこがリポジトリでないことの見立てが、この空に懸かっている',
    ).toEqual([]);
  });
});

describe('for-each-ref', () => {
  const OUTPUT = [
    ['main', 'abc1234', '2026-08-04T10:00:00+09:00', '土台を置く', '*'].join(NUL),
    ['topic', 'def5678', '2026-08-03T10:00:00+09:00', 'git を移す: 半分', ''].join(NUL),
    '',
  ].join('\n');

  it('欄を \\0 で切る', () => {
    expect(
      parseBranchRefs(OUTPUT)[1],
      '題には空白も記号も入る。空白で切ると 1 語目までしか読めない',
    ).toEqual({
      name: 'topic',
      sha: 'def5678',
      date: '2026-08-03T10:00:00+09:00',
      subject: 'git を移す: 半分',
      head: false,
    });
  });

  it('いま出ている枝は * で分かる', () => {
    expect(parseBranchRefs(OUTPUT)[0]?.head, '* が付いた枝だけが、いま出ている枝である').toBe(true);
  });

  it('欄が足りない行も落とさない', () => {
    expect(
      parseBranchRefs(`orphan${NUL}abc1234\n`)[0],
      '1 行の欠けで枝の一覧ごと落とすほうが、はるかに大きな嘘になる',
    ).toEqual({
      name: 'orphan',
      sha: 'abc1234',
      date: '',
      subject: '',
      head: false,
    });
  });
});

describe('branch --no-merged', () => {
  it('名前だけを集める', () => {
    expect(
      [...parseBranchNames('  topic\nfeature/x\n\n')],
      '前後の空白は git が並べのために置くもので、名前の一部ではない',
    ).toEqual(['topic', 'feature/x']);
  });
});

describe('log --first-parent', () => {
  const OUTPUT = [
    [
      '9f8e7d6c5b4a39281706f5e4d3c2b1a098765432',
      '1111111111111111111111111111111111111111 2222222222222222222222222222222222222222',
      '2026-08-04T10:00:00+09:00',
      'topic を合わせる',
    ].join(NUL),
    [
      '1111111111111111111111111111111111111111',
      '3333333333333333333333333333333333333333',
      '2026-08-03T10:00:00+09:00',
      '土台を置く',
    ].join(NUL),
    '',
  ].join('\n');

  it('親が 2 つ以上なら合流の節', () => {
    expect(
      parseMainline(OUTPUT).map((commit) => commit.merge),
      '合流の節だけが横の線を縦軸へ引き込む。見誤ると木の形が変わる',
    ).toEqual([true, false]);
  });

  it('sha は短くする', () => {
    expect(parseMainline(OUTPUT)[0]?.sha, '縦軸に並ぶ字は、人が目で追える長さで揃える').toBe(
      '9f8e7d6c5b',
    );
  });

  it('親が 1 つも無い最初の節も読める', () => {
    expect(
      parseMainline(`abc${NUL}${NUL}2026-08-01T00:00:00Z${NUL}最初`)[0]?.merge,
      '親の欄が空でも、それは合流ではないというだけである',
    ).toBe(false);
  });
});

describe('log(見出し)', () => {
  it('sha / 時刻 / 書いた人 / 題 を読む', () => {
    const output = `abc1234${NUL}2026-08-04T10:00:00+09:00${NUL}hiroiku${NUL}git を移す\n`;
    expect(parseCommitLog(output), '欄の並びは書式と対で決まる').toEqual([
      {
        sha: 'abc1234',
        date: '2026-08-04T10:00:00+09:00',
        author: 'hiroiku',
        subject: 'git を移す',
      },
    ]);
  });
});

describe('diff --name-only', () => {
  it('空の行を落とす', () => {
    expect(
      parseChangedPaths('src/a.ts\nsrc/b.ts\n'),
      '末尾の改行を道として数えると、触っていないファイルが重なりに混ざる',
    ).toEqual(['src/a.ts', 'src/b.ts']);
  });
});

describe('diff --numstat', () => {
  it('増減と道を読む', () => {
    expect(parseNumstat('12\t3\tsrc/a.ts\n'), '増減はタブ区切りで並ぶ').toEqual([
      { path: 'src/a.ts', add: 12, del: 3 },
    ]);
  });

  it('数の出ないファイルは 0 として数え、行は残す', () => {
    expect(
      parseNumstat('-\t-\tassets/logo.png\n'),
      '中身が字でないものに増減は無い。だが触った事実まで消してはならない',
    ).toEqual([{ path: 'assets/logo.png', add: 0, del: 0 }]);
  });
});
