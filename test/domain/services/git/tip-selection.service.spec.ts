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
  it('本流に入った枝は並べない', () => {
    const tips = selectTips({
      base: 'main',
      branches: [branch('topic'), branch('done')],
      worktrees: [],
      unmerged: new Set(['topic']),
    });
    expect(
      tips.map((tip) => tip.name),
      '入ってしまった枝を横に並べても、本流と同じ記録を二度見せるだけである',
    ).toEqual(['topic']);
  });

  it('本流そのものは線ではない', () => {
    const tips = selectTips({
      base: 'main',
      branches: [branch('main')],
      worktrees: [],
      // 本流が自分に入っていないと答えることがある(記録がまだ無いときなど)
      unmerged: new Set(['main']),
    });
    expect(tips, '縦軸を横にも並べると、同じ線が二本に見える').toEqual([]);
  });

  it('枝は名で尋ね、記録を直に指す場所は sha で尋ねる', () => {
    const tips = selectTips({
      base: 'main',
      branches: [branch('topic')],
      worktrees: [worktree('/work/hive-x', { detached: true, sha: '1122334455' })],
      unmerged: new Set(['topic']),
    });
    expect(
      tips.map((tip) => tip.rev),
      '枝を持たない線を名で尋ねると、git は何のことか分からない',
    ).toEqual(['topic', '1122334455']);
  });

  it('枝を出している場所を線に添える', () => {
    const tips = selectTips({
      base: 'main',
      branches: [branch('topic')],
      worktrees: [worktree('/work/hive-topic', { branch: 'topic', sha: 'aaaaaaaaaa' })],
      unmerged: new Set(['topic']),
    });
    expect(tips[0]?.worktree, 'どこで手が動いているかは、線の名だけでは分からない').toBe(
      '/work/hive-topic',
    );
  });

  it('記録を直に指す場所は場所の末尾の名で呼ぶ', () => {
    const tips = selectTips({
      base: 'main',
      branches: [],
      worktrees: [worktree('/work/hive-x', { detached: true, sha: '1122334455' })],
      unmerged: new Set(),
    });
    expect(tips[0], '枝を持たない線には、呼ぶ名が場所しかない').toEqual({
      kind: 'worktree',
      name: 'hive-x',
      sha: '1122334455',
      date: null,
      subject: '',
      worktree: '/work/hive-x',
      rev: '1122334455',
    });
  });

  it('枝を出している場所は記録を直に指してはいない', () => {
    const tips = selectTips({
      base: 'main',
      branches: [],
      worktrees: [worktree('/work/hive', { branch: 'main', sha: 'aaaaaaaaaa' })],
      unmerged: new Set(),
    });
    expect(tips, '枝を出している場所を線に足すと、同じ先端が二度並ぶ').toEqual([]);
  });

  it('同じ枝が二か所に出ていれば、後の場所を採る', () => {
    const tips = selectTips({
      base: 'main',
      branches: [branch('topic')],
      worktrees: [
        worktree('/work/first', { branch: 'topic', sha: 'aaaaaaaaaa' }),
        worktree('/work/second', { branch: 'topic', sha: 'aaaaaaaaaa' }),
      ],
      unmerged: new Set(['topic']),
    });
    expect(tips[0]?.worktree, '先勝ちと後勝ちで、どこで手が動いているかの答えが変わる').toBe(
      '/work/second',
    );
  });

  /* 上限は**数そのものを書く。** 定数と突き合わせると、上限が動いても常に釣り合うので、
     窓の切り方が変わったことを誰も言えない。 */

  it('枝の線は 14 本で頭を切る', () => {
    const names = Array.from({ length: TIP_LIMIT + 5 }, (_, index) => `topic-${index}`);
    const tips = selectTips({
      base: 'main',
      branches: names.map((name) => branch(name)),
      worktrees: [],
      unmerged: new Set(names),
    });
    expect(tips.length, '古い線まで並べると、どれが今の仕事なのか見る人に分からなくなる').toBe(14);
  });

  it('記録を直に指す場所には 4 枠を空けておく', () => {
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
      '枝を持たない線は名前で探せない。枠を空けておかないと、埋もれて二度と見つからない',
    ).toBe(4);
  });
});
