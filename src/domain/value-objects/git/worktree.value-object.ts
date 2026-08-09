/* 作業場所 1 つ。`git worktree list --porcelain` が答える単位である。

   枝を出しているものと、記録を直に指しているもの(detached)がある。
   後者は枝の名を持たないので、木の上では作業場所の名前で呼ぶほかない。 */

export interface Worktree {
  readonly path: string;
  /** 出している枝。detached なら無い */
  readonly branch: string | null;
  /** 短くした HEAD の sha。読めなかった作業場所では無い */
  readonly sha: string | null;
  readonly detached: boolean;
}
