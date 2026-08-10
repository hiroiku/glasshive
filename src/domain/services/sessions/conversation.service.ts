/* `transcript` の 1 行を、人が読める会話のイベントへ変換する。

   `transcript` の行はツールの内部形式をそのまま持っている。見る側に要るのは、誰が・いつ・
   何を言ったかだけなので、見せる値のあるブロックだけを拾い、それ以外は落とす。

   落とした結果、ブロックが 1 つも残らない行はイベントではない。ツールどうしの内部のやりとりを
   会話に混ぜると、ユーザーの目には意味の無い行が並ぶだけになる。 */

import { asString, type JsonRecord } from '~/app-kernel/json.ts';
import type {
  ConversationBlock,
  ConversationEvent,
} from '~/domain/entities/sessions/conversation-event.entity.ts';
import {
  MAX_TEXT_CHARS,
  TRUNCATION_NOTICE,
} from '~/domain/value-objects/sessions/event-page.value-object.ts';

/* 型の分からない値から欄をそのまま取り出す。

   中身が文字列か並びかを問わない場所に使う。並びの添字を名前で引くことはしないので、
   記録(入れ子の並びでない object)のときだけ覗く。 */
function fieldOf(source: unknown, key: string): unknown {
  if (typeof source !== 'object' || source === null || Array.isArray(source)) return undefined;
  return (source as JsonRecord)[key];
}

/* 運ぶ量の上限で切る。切り詰めたことが分かる省略記号を末尾に添える。

   数えるのは **符号位置**([...s] で分ける)。UTF-16 の長さで切ると、絵文字のような
   2 単位で 1 文字を成すものが割れて、壊れた文字が出る。 */
export function capText(text: string, maxChars: number = MAX_TEXT_CHARS): string {
  const chars = [...text];
  return chars.length > maxChars ? chars.slice(0, maxChars).join('') + TRUNCATION_NOTICE : text;
}

/* ツールの結果を 1 つの文字列へ正規化する。

   結果は文字列のこともブロックの並びのこともある。並びのときは各ブロックの text 欄のうち文字列である
   ものだけを繋ぐ。画像などの文字列でない結果は、会話の流れとして読めないので落とす。 */
function flattenResult(content: unknown): string {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  const texts: string[] = [];
  for (const block of content) {
    const text = asString(block, 'text');
    if (text !== undefined) texts.push(text);
  }
  return texts.join('\n');
}

/** 1 行を人が読める形へ変換する。読めない行・見せるブロックが無い行は null */
export function reduceEvent(
  line: string,
  maxChars: number = MAX_TEXT_CHARS,
): ConversationEvent | null {
  let record: unknown;
  try {
    record = JSON.parse(line);
  } catch {
    return null;
  }

  const ts = asString(record, 'timestamp') ?? null;
  const blocks: ConversationBlock[] = [];
  const type = asString(record, 'type');

  if (type === 'user') {
    const content = fieldOf(fieldOf(record, 'message'), 'content');
    if (typeof content === 'string') {
      blocks.push({ kind: 'text', text: capText(content, maxChars) });
    } else if (Array.isArray(content)) {
      for (const block of content) {
        const kind = asString(block, 'type');
        const text = asString(block, 'text');
        if (kind === 'text' && text !== undefined) {
          blocks.push({ kind: 'text', text: capText(text, maxChars) });
        } else if (kind === 'tool_result') {
          const result = flattenResult(fieldOf(block, 'content'));
          blocks.push({ kind: 'tool_result', text: capText(result, maxChars) });
        }
      }
    }
    return blocks.length ? { role: 'user', ts, blocks } : null;
  }

  if (type === 'assistant') {
    const content = fieldOf(fieldOf(record, 'message'), 'content');
    if (!Array.isArray(content)) return null;
    for (const block of content) {
      const kind = asString(block, 'type');
      if (kind === 'text') {
        const text = asString(block, 'text');
        if (text?.trim()) {
          blocks.push({ kind: 'text', text: capText(text, maxChars) });
        }
      } else if (kind === 'thinking') {
        // 本文なし(signature のみ)の thinking を書くハーネスがある — 中身の無いブロックは見せない
        const thinking = asString(block, 'thinking');
        if (thinking?.trim()) {
          blocks.push({ kind: 'thinking', text: capText(thinking, maxChars) });
        }
      } else if (kind === 'tool_use') {
        const name = asString(block, 'name') || 'tool';
        let input = '';
        try {
          input = JSON.stringify(fieldOf(block, 'input') ?? {}, null, 2);
        } catch {
          // 直列化できない入力は空で見せる
        }
        blocks.push({ kind: 'tool_use', name, text: capText(input, maxChars) });
      }
    }
    return blocks.length ? { role: 'assistant', ts, blocks } : null;
  }

  if (type === 'system') {
    const text = asString(record, 'content');
    if (text === undefined) return null;
    const name = asString(record, 'subtype') ?? null;
    blocks.push({ kind: 'system', name, text: capText(text, maxChars) });
    return { role: 'system', ts, blocks };
  }

  return null;
}
