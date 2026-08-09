import path from 'node:path';
import type { BranchRef } from '~/domain/value-objects/git/branch-ref.value-object.ts';
import type { Worktree } from '~/domain/value-objects/git/worktree.value-object.ts';

/* 「生きている線」を選ぶ。

   生きているとは、本流にまだ入っていないということである。入ってしまった枝は本流の一部
   なので、横に並べても同じ記録を二度見せるだけになる。

   数を切るのは画面の都合ではない。**古い線まで並べると、見る人はどれが今の仕事か分から
   なくなる。** 最後に記録した時刻の新しい順に頭だけを取り、記録を直に指している作業場所は
   別枠で足す — 枝を持たない線は名前で探せないので、埋もれると二度と見つからない。

   node:path を使っているのは、区切りの決まりを写し取らないためである。ここは道の字を
   読むだけで、ファイルには触らない。 */

/** 枝の線を何本まで並べるか */
export const TIP_LIMIT = 14;

/** 記録を直に指している作業場所のために空けておく枠 */
export const DETACHED_TIP_EXTRA = 4;

/** まだ隔たりを数えていない線 */
export interface TipCandidate {
  readonly kind: 'branch' | 'worktree';
  readonly name: string;
  readonly sha: string;
  readonly date: string | null;
  readonly subject: string;
  readonly worktree: string | null;
  /* 分かれ目と隔たりを尋ねるときに git へ渡す字。

     枝は名で尋ねる。作業場所は枝を持たないので sha で尋ねるほかない。 */
  readonly rev: string;
}

export interface TipSelectionInput {
  readonly base: string;
  readonly branches: readonly BranchRef[];
  readonly worktrees: readonly Worktree[];
  /** 本流に入っていない枝の名 */
  readonly unmerged: ReadonlySet<string>;
}

/** 枝の名から、その枝を出している作業場所を引く。同じ枝が二か所に出ていれば後のものを採る */
function worktreesByBranch(worktrees: readonly Worktree[]): Map<string, Worktree> {
  const byBranch = new Map<string, Worktree>();
  for (const worktree of worktrees) {
    if (worktree.branch !== null) byBranch.set(worktree.branch, worktree);
  }
  return byBranch;
}

export function selectTips(input: TipSelectionInput): TipCandidate[] {
  const { base, branches, worktrees, unmerged } = input;
  const byBranch = worktreesByBranch(worktrees);
  const tips: TipCandidate[] = [];

  for (const branch of branches) {
    if (tips.length >= TIP_LIMIT) break;
    // 本流そのものは線ではない。本流に入った枝も、もう本流の一部である
    if (!unmerged.has(branch.name) || branch.name === base) continue;
    tips.push({
      kind: 'branch',
      name: branch.name,
      sha: branch.sha,
      date: branch.date,
      subject: branch.subject,
      worktree: byBranch.get(branch.name)?.path ?? null,
      rev: branch.name,
    });
  }

  for (const worktree of worktrees) {
    if (tips.length >= TIP_LIMIT + DETACHED_TIP_EXTRA) break;
    if (!worktree.detached || worktree.sha === null) continue;
    tips.push({
      kind: 'worktree',
      name: path.basename(worktree.path),
      sha: worktree.sha,
      // 枝を持たないので、最後の記録の時刻も題も見出しからは引けない
      date: null,
      subject: '',
      worktree: worktree.path,
      rev: worktree.sha,
    });
  }

  return tips;
}
