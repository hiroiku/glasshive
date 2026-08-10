import path from 'node:path';
import type { BranchRef } from '~/domain/value-objects/git/branch-ref.value-object.ts';
import type { Worktree } from '~/domain/value-objects/git/worktree.value-object.ts';

/* 「生きている先端」を選ぶ。

   生きているとは、本流にまだ入っていないということである。入ってしまったブランチは本流の一部
   なので、横に並べても同じコミットを二度見せるだけになる。

   数を切るのは画面の都合ではない。**古い先端まで並べると、ユーザーはどれが今の仕事か分から
   なくなる。** 最後にコミットした時刻の新しい順に頭だけを取り、コミットを直に指している
   `worktree` は別枠で足す — ブランチを持たない先端は名前で探せないので、埋もれると二度と
   見つからない。

   `node:path` を使っているのは、区切り文字の決まりを写し取らないためである。ここはパスの
   文字列を読むだけで、ファイルには触らない。 */

/** ブランチの先端をいくつまで並べるか */
export const TIP_LIMIT = 14;

/** コミットを直に指している `worktree` のために空けておく枠 */
export const DETACHED_TIP_EXTRA = 4;

/** まだ隔たりを数えていない先端 */
export interface TipCandidate {
  readonly kind: 'branch' | 'worktree';
  readonly name: string;
  readonly sha: string;
  readonly date: string | null;
  readonly subject: string;
  readonly worktree: string | null;
  /* 分かれ目と隔たりを尋ねるときに `git` へ渡すリビジョン。

     ブランチは名で尋ねる。`worktree` はブランチを持たないので sha で尋ねるほかない。 */
  readonly rev: string;
}

export interface TipSelectionInput {
  readonly base: string;
  readonly branches: readonly BranchRef[];
  readonly worktrees: readonly Worktree[];
  /** 本流に入っていないブランチの名 */
  readonly unmerged: ReadonlySet<string>;
}

/** ブランチの名から、そのブランチを出している `worktree` を引く。同じブランチが二か所に出ていれば後のものを採る */
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
    // 本流そのものは先端ではない。本流に入ったブランチも、もう本流の一部である
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
      // ブランチを持たないので、最後のコミットの時刻も題もメタ情報からは引けない
      date: null,
      subject: '',
      worktree: worktree.path,
      rev: worktree.sha,
    });
  }

  return tips;
}
