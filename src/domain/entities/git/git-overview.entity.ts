import type { BranchRef } from '~/domain/value-objects/git/branch-ref.value-object.ts';
import type { MainlineCommit } from '~/domain/value-objects/git/commit-summary.value-object.ts';
import type { Worktree } from '~/domain/value-objects/git/worktree.value-object.ts';

/* リポジトリをひと目ぶん観たもの。

   縦軸は統合の枝(本流)、横に「生きている線」— まだ本流に入っていない枝の先端と、
   記録を直に指している作業場所 — が並ぶ。線どうしが同じファイルを触っていれば、
   統合するときにぶつかる見込みとして添える。 */

/** 生きている線 1 本 */
export interface Tip {
  readonly kind: 'branch' | 'worktree';
  /** 枝なら枝の名、作業場所なら場所の末尾の名 */
  readonly name: string;
  readonly sha: string;
  /** 作業場所の線は最後の記録の時刻を持たない */
  readonly date: string | null;
  readonly subject: string;
  /** この線が出ている作業場所。無ければ null */
  readonly worktree: string | null;
  /** 本流と分かれた位置 */
  readonly mergeBase: string;
  /** 本流より先へ進んでいる節の数 */
  readonly ahead: number;
  /** 本流に取り残されている節の数 */
  readonly behind: number;
}

/** 同じファイルを触っている線の組。統合の順を決めるための見込みであって、実際に試してはいない */
export interface ConflictForecast {
  readonly a: string;
  readonly b: string;
  /** 両方が触っているファイルの本数 */
  readonly count: number;
  /** そのうちの頭だけ */
  readonly files: readonly string[];
}

export interface GitOverview {
  /** 統合の枝。主たる作業場所が出している枝で、決められなければ `HEAD` */
  readonly base: string;
  readonly worktrees: readonly Worktree[];
  readonly branches: readonly BranchRef[];
  readonly mainline: readonly MainlineCommit[];
  readonly tips: readonly Tip[];
  readonly conflicts: readonly ConflictForecast[];
}
