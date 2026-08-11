import type { BranchRef } from '~/domain/value-objects/git/branch-ref.value-object.ts';
import type { MainlineCommit } from '~/domain/value-objects/git/commit-summary.value-object.ts';
import type { Worktree } from '~/domain/value-objects/git/worktree.value-object.ts';

/* リポジトリを一望したもの。

   縦軸は統合のブランチ(本流)、横に「生きている先端」— まだ本流に入っていないブランチの先端と、
   コミットを直に指している `worktree` — が並ぶ。先端どうしが同じファイルを触っていれば、
   統合するときにぶつかる見込みとして添える。 */

/** 生きている先端 1 つ */
export interface Tip {
  readonly kind: 'branch' | 'worktree';
  /** ブランチならブランチの名、`worktree` ならパスの末尾の名 */
  readonly name: string;
  readonly sha: string;
  /** `worktree` の先端は最後のコミットの時刻を持たない */
  readonly date: string | null;
  readonly subject: string;
  /** この先端が出ている `worktree`。無ければ null */
  readonly worktree: string | null;
  /** 本流と分かれた位置 */
  readonly mergeBase: string;
  /** 本流より先へ進んでいるコミットの数 */
  readonly ahead: number;
  /** 本流に取り残されているコミットの数 */
  readonly behind: number;
}

/** 同じファイルを触っている先端の組。統合の順を決めるための見込みであって、実際に試してはいない */
export interface ConflictForecast {
  readonly a: string;
  readonly b: string;
  /** 両方が触っているファイルの本数 */
  readonly count: number;
  /** そのうちの頭だけ */
  readonly files: readonly string[];
}

export interface GitOverview {
  /** 統合のブランチ。主たる `worktree` が出しているブランチで、決められなければ `HEAD` */
  readonly base: string;
  readonly worktrees: readonly Worktree[];
  readonly branches: readonly BranchRef[];
  readonly mainline: readonly MainlineCommit[];
  /* 遡る数の上限で本流が切れているか。**切れているなら、ここに無いコミットが在る。**
     切れたことを言わないと、上限より前で分かれたブランチが、いちばん古いコミットで
     分かれたものとして読まれる。 */
  readonly mainlineTruncated: boolean;
  readonly tips: readonly Tip[];
  readonly conflicts: readonly ConflictForecast[];
}
