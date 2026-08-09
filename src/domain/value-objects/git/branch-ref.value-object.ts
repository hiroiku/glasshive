/** 枝 1 本。`for-each-ref` が答える見出しで、並びは最後に記録した時刻の新しい順 */
export interface BranchRef {
  readonly name: string;
  /** git が短くした sha。桁数は git の設定で変わるので、こちらでは切らない */
  readonly sha: string;
  /** 最後の記録の時刻。git が書いた字面のまま持つ */
  readonly date: string;
  readonly subject: string;
  /** いま出ている枝か */
  readonly head: boolean;
}
