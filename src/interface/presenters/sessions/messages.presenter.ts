import type { Observation } from '~/app-kernel/observation.ts';
import type { SessionMessages } from '~/application/use-cases/sessions/observe-messages.use-case.ts';
import { iso, type ObservationState } from '~/interface/presenters/sessions/tree.presenter.ts';

/* メッセージのやり取りを、外部 API が読む形へ写す。

   写すだけである。並べ替えも間引きもしない — どちらも導出の仕事で、
   ここでやると同じ判断が二か所に散る。 */

export interface HopJson {
  at: string;
  /** 送り手。木の中での同一性で言う */
  from: string;
  /** 受け手。同じく木の中での同一性 */
  to: string;
  /** 送り手が添えた一行。無ければ空 */
  summary: string;
  /** そのメッセージを指す `tool_use` の id */
  tool_use: string;
}

export interface MessagesJson {
  state: ObservationState;
  /** 観測できなかった理由。観測できたときは無い */
  reason: string | null;
  /* 読み取り範囲が `transcript` の先頭まで届いたか。**読めたかどうかの話ではない** —
     届かなかった `transcript` は、それより前のメッセージが見えていないというだけである。 */
  complete: boolean;
  /** 宛先を置けなかったメッセージの数。読み取り範囲の外の相手へ出ていったもの */
  unplaced: number;
  hops: HopJson[];
}

export function presentMessages(messages: Observation<SessionMessages>): MessagesJson {
  if (messages.kind !== 'observed') {
    return {
      state: messages.kind,
      reason: messages.kind === 'absent' ? messages.reason : messages.error.code,
      complete: false,
      unplaced: 0,
      hops: [],
    };
  }
  return {
    state: 'observed',
    reason: null,
    complete: messages.value.complete,
    unplaced: messages.value.unplaced,
    hops: messages.value.hops.map((placed) => ({
      at: iso(placed.hop.atMs),
      from: placed.fromId,
      to: placed.toId,
      summary: placed.hop.summary,
      tool_use: placed.hop.toolUseId,
    })),
  };
}
