/* 会話の 1 イベント。

   正本の行は道具の内部の形をそのまま持っているので、人が読める塊の並びへ還元する。
   還元して塊が 1 つも残らない行(道具の内部だけのやりとり)は、イベントではない。 */

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
  /** 正本に書かれていた時刻の字面。手を加えない */
  readonly ts: string | null;
  readonly blocks: readonly ConversationBlock[];
}
