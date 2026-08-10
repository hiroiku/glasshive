/** ブランチ 1 本。`for-each-ref` が答えるメタ情報で、並びは最後にコミットした時刻の新しい順 */
export interface BranchRef {
  readonly name: string;
  /** `git` が短くした sha。桁数は `git` の設定で変わるので、こちらでは切らない */
  readonly sha: string;
  /** 最後のコミットの時刻。`git` が書いた表記のまま持つ */
  readonly date: string;
  readonly subject: string;
  /** いま出ているブランチか */
  readonly head: boolean;
}
