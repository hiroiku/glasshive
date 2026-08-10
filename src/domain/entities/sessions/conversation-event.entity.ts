/* 会話の 1 イベント。

   `transcript` の行はツールの内部形式をそのまま持っているので、人が読めるブロックの並びへ変換する。
   変換してブロックが 1 つも残らない行(ツールの内部だけのやりとり)は、イベントではない。 */

export type ConversationRole = 'user' | 'assistant' | 'system';

export type ConversationBlock =
  | { readonly kind: 'text'; readonly text: string }
  | { readonly kind: 'thinking'; readonly text: string }
  | { readonly kind: 'tool_use'; readonly name: string; readonly text: string }
  | { readonly kind: 'tool_result'; readonly text: string }
  | {
      readonly kind: 'system';
      readonly name: string | null;
      readonly text: string;
    };

export interface ConversationEvent {
  readonly role: ConversationRole;
  /** `transcript` に書かれていた時刻の表記。手を加えない */
  readonly ts: string | null;
  readonly blocks: readonly ConversationBlock[];
}
