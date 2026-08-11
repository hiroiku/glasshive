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
  /* 送った結果に書かれたメッセージの id。**受け取った側の `transcript` にも同じ文字列が
     書かれる。** 別のセッションへ渡ったメッセージの両端を結べる唯一の鍵で、名前でも
     ソケットのパスでもない。届かなかった呼び出しでは書かれないので `null`。 */
  readonly msgId: string | null;
}

/* 別のセッションから届いたメッセージ 1 通。

   受け取った側の `transcript` には、送り手が名乗った名前と、届いた本文と、`msg_id` が
   書かれる。**名前から相手の `transcript` は引けない** —— 名乗る名前はセッションの id でも
   `slug` でもなく、こちらが観測した 95 本のどれとも一致しない。両端を結べるのは `msg_id`
   だけである。 */
export interface AgentDelivery {
  readonly atMs: number;
  /** 送った側の結果に書かれたものと同じ文字列 */
  readonly msgId: string;
  /** 送り手が名乗った名前。相手を指せる id ではない */
  readonly fromName: string | null;
  /* 送り手の宛先の綴り。`uds:` のソケットのパスのことがあり、書かれていないこともある。
     ソケットはプロセスを指すもので、プロセスが終われば使い回される —— 相手の同一性ではない。 */
  readonly fromAddress: string | null;
  /** 届き方。`prompting` など。**「届いた」に潰さない** —— 別の値なら別のことである */
  readonly mode: string | null;
}

/** セッション本体を指す決め事の宛先。名前ではないので、エージェントの一覧と突き合わせても当たらない */
export const SESSION_ADDRESSES: readonly string[] = ['main', 'team-lead', 'lead'];
