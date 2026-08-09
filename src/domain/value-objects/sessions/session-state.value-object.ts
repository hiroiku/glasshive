/* セッションの三つの様子と、待っている相手。

   稼働と終了だけでは足りない。手が空いていて人の返事を待っているセッションは、
   終わったセッションと見分けが付かなければならない — この道具の主目的は
   「あなたを待っているものを見つける」ことだからである。 */

export type SessionState = 'active' | 'waiting' | 'ended';

/** 子は待たない。委譲された仕事は自分で完結するか、終わるかのどちらかである */
export type SubagentState = 'active' | 'ended';

/** 何を待っているか。`user` = 人の入力待ち、`agents` = 委譲した子の完了待ち */
export type AwaitingKind = 'user' | 'agents';

/* 正本の最後の意味あるイベントの形。ここから「人の入力を待っているか」が決まる。

   `tool` と `tool_result` と `think` は「まだ自分の番」なので待ちではない。
   `text`(本文で完結した応答)・`ask`(問いかけ)・`stop`(停止フック)は自分の番が
   終わったことを表す。 */
export type LastEventShape = 'user' | 'tool_result' | 'tool' | 'ask' | 'text' | 'think' | 'stop';

/** 人の入力待ちを表す形 */
export const AWAITING_USER_SHAPES: readonly LastEventShape[] = ['text', 'ask', 'stop'];

/** 自分の番が終わっている形か。末尾が読めなかった(null)ときは終わっていないものとして扱う */
export const isAwaitingUserShape = (shape: LastEventShape | null): boolean =>
  shape !== null && AWAITING_USER_SHAPES.includes(shape);

/** 問いかけを表す道具の名前。これだけは `tool` ではなく `ask` として数える */
export const ASK_TOOL_NAME = 'AskUserQuestion';
