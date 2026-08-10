/* エージェント間メッセージ 1 通の記録。

   エージェントは互いに呼びかけ合う。メッセージは送った側の `transcript` にだけ `tool_use`
   として残り、受け取った側には本文として届く。だから数えるのは送った側だけにする —
   両方から拾うと、同じメッセージを二度数えることになる。

   宛先は文字列である。名前のことも、素の id のことも、`main` や `team-lead` のような
   決め事のこともある。**誰を指しているかを決めるのはここではない** — 表示している
   エージェントの一覧と突き合わせられる場所の仕事で、ここは書かれた文字列をそのまま持つ。 */

export interface AgentHop {
  readonly atMs: number;
  /** 送り手として `transcript` に書かれた id。セッション本体が送ったときは書かれない */
  readonly fromAgentId: string | null;
  /** 宛先として書かれた文字列 */
  readonly to: string;
  /** 送り手が添えた一行。無いこともある */
  readonly summary: string;
  /** この呼び出しを指す `tool_use` の id。同じメッセージを会話の中から見つけられる */
  readonly toolUseId: string;
}

/** セッション本体を指す決め事の宛先。名前ではないので、エージェントの一覧と突き合わせても当たらない */
export const SESSION_ADDRESSES: readonly string[] = ['main', 'team-lead', 'lead'];
