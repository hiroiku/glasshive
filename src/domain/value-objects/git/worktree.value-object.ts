/* `worktree` 1 つ。`git worktree list --porcelain` が答える単位である。

   ブランチを出しているものと、コミットを直に指しているもの(detached)がある。
   後者はブランチの名を持たないので、木の上では `worktree` の名前で呼ぶほかない。 */

export interface Worktree {
  readonly path: string;
  /** 出しているブランチ。detached なら無い */
  readonly branch: string | null;
  /** 短くした HEAD の sha。読めなかった `worktree` では無い */
  readonly sha: string | null;
  readonly detached: boolean;
}
