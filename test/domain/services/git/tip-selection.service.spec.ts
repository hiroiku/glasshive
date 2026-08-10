import { describe, expect, it } from 'vitest';
import {
  DETACHED_TIP_EXTRA,
  selectTips,
  TIP_LIMIT,
} from '~/domain/services/git/tip-selection.service.ts';
import type { BranchRef } from '~/domain/value-objects/git/branch-ref.value-object.ts';
import type { Worktree } from '~/domain/value-objects/git/worktree.value-object.ts';

const branch = (name: string, overrides: Partial<BranchRef> = {}): BranchRef => ({
  name,
  sha: `sha-${name}`,
  date: '2026-08-04T10:00:00+09:00',
  subject: `${name} の仕事`,
  head: false,
  ...overrides,
});

const worktree = (path: string, overrides: Partial<Worktree> = {}): Worktree => ({
  path,
  branch: null,
  sha: null,
  detached: false,
  ...overrides,
});

describe('生きている線を選ぶ', () => {
  it('本流に入ったブランチは並べない', () => {
    const tips = selectTips({
      base: 'main',
      branches: [branch('topic'), branch('done')],
      worktrees: [],
      unmerged: new Set(['topic']),
    });
    expect(
      tips.map((tip) => tip.name),
      '入ってしまったブランチを横に並べても、本流と同じコミットを二度見せるだけである',
    ).toEqual(['topic']);
  });

  it('本流そのものは線ではない', () => {
    const tips = selectTips({
      base: 'main',
      branches: [branch('main')],
      worktrees: [],
      // 本流が自分に入っていないと答えることがある(コミットがまだ無いときなど)
      unmerged: new Set(['main']),
    });
    expect(tips, '縦軸を横にも並べると、同じ線が二本に見える').toEqual([]);
  });

  it('ブランチは名前で尋ね、コミットを直に指すパスは sha で尋ねる', () => {
    const tips = selectTips({
      base: 'main',
      branches: [branch('topic')],
      worktrees: [worktree('/work/hive-x', { detached: true, sha: '1122334455' })],
      unmerged: new Set(['topic']),
    });
    expect(
      tips.map((tip) => tip.rev),
      'ブランチを持たない線を名前で尋ねると、git は何のことか分からない',
    ).toEqual(['topic', '1122334455']);
  });

  it('ブランチを出しているパスを線に添える', () => {
    const tips = selectTips({
      base: 'main',
      branches: [branch('topic')],
      worktrees: [worktree('/work/hive-topic', { branch: 'topic', sha: 'aaaaaaaaaa' })],
      unmerged: new Set(['topic']),
    });
    expect(tips[0]?.worktree, 'どこで手が動いているかは、線の名前だけでは分からない').toBe(
      '/work/hive-topic',
    );
  });

  it('コミットを直に指すパスはパスの末尾の名前で呼ぶ', () => {
    const tips = selectTips({
      base: 'main',
      branches: [],
      worktrees: [worktree('/work/hive-x', { detached: true, sha: '1122334455' })],
      unmerged: new Set(),
    });
    expect(tips[0], 'ブランチを持たない線には、呼ぶ名前がパスしかない').toEqual({
      kind: 'worktree',
      name: 'hive-x',
      sha: '1122334455',
      date: null,
      subject: '',
      worktree: '/work/hive-x',
      rev: '1122334455',
    });
  });

  it('ブランチを出しているパスはコミットを直に指してはいない', () => {
    const tips = selectTips({
      base: 'main',
      branches: [],
      worktrees: [worktree('/work/hive', { branch: 'main', sha: 'aaaaaaaaaa' })],
      unmerged: new Set(),
    });
    expect(tips, 'ブランチを出しているパスを線に足すと、同じ先端が二度並ぶ').toEqual([]);
  });

  it('同じブランチが二か所に出ていれば、後のパスを採る', () => {
    const tips = selectTips({
      base: 'main',
      branches: [branch('topic')],
      worktrees: [
        worktree('/work/first', { branch: 'topic', sha: 'aaaaaaaaaa' }),
        worktree('/work/second', { branch: 'topic', sha: 'aaaaaaaaaa' }),
      ],
      unmerged: new Set(['topic']),
    });
    expect(tips[0]?.worktree, '先勝ちと後勝ちで、どこで手が動いているかの結果が変わる').toBe(
      '/work/second',
    );
  });

  /* 上限は**リテラルの数値で書く。** 定数と突き合わせると上限が動いても常に釣り合ってしまい、
     見せる件数の上限が変わったことを誰も言えない。 */

  it('ブランチの線は 14 本で頭を切る', () => {
    const names = Array.from({ length: TIP_LIMIT + 5 }, (_, index) => `topic-${index}`);
    const tips = selectTips({
      base: 'main',
      branches: names.map((name) => branch(name)),
      worktrees: [],
      unmerged: new Set(names),
    });
    expect(tips.length, '古い線まで並べると、どれが今の仕事なのかユーザーに分からなくなる').toBe(
      14,
    );
  });

  it('コミットを直に指すパスには 4 枠を空けておく', () => {
    const names = Array.from({ length: TIP_LIMIT + 5 }, (_, index) => `topic-${index}`);
    const detached = Array.from({ length: DETACHED_TIP_EXTRA + 2 }, (_, index) =>
      worktree(`/work/hive-${index}`, {
        detached: true,
        sha: `sha-${index}`,
      }),
    );
    const tips = selectTips({
      base: 'main',
      branches: names.map((name) => branch(name)),
      worktrees: detached,
      unmerged: new Set(names),
    });
    expect(
      tips.filter((tip) => tip.kind === 'worktree').length,
      'ブランチを持たない線は名前で探せない。枠を空けておかないと、埋もれて二度と見つからない',
    ).toBe(4);
  });
});
