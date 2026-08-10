import type { AgentHop } from '~/domain/value-objects/sessions/agent-message.value-object.ts';

/* `transcript` のテキストから、送信したメッセージだけを拾う。**純関数。**

   壊れた行は飛ばす。読めない 1 行はイベントではないので、そこで走査を止める理由が無い。

   ツール名で早期に絞り込むのは、`transcript` が数 MiB あるからである。ほとんどの行は
   メッセージと関わりが無く、その全部をパースすると画面を開くたびに機械が止まる。 */

const SEND_TOOL = 'SendMessage';

const textOf = (value: unknown): string => (typeof value === 'string' ? value : '');

/** メッセージ 1 通の中身。宛先が空なら、どこへ送られたのかが決まらないので数えない */
function hopOf(block: Record<string, unknown>, record: Record<string, unknown>): AgentHop | null {
  const input = block.input;
  if (typeof input !== 'object' || input === null || Array.isArray(input)) return null;
  const to = textOf((input as Record<string, unknown>).to);
  const toolUseId = textOf(block.id);
  if (to === '' || toolUseId === '') return null;

  const atMs = Date.parse(textOf(record.timestamp));
  if (!Number.isFinite(atMs)) return null;

  return {
    atMs,
    fromAgentId: textOf(record.agentId) === '' ? null : textOf(record.agentId),
    to,
    summary: textOf((input as Record<string, unknown>).summary),
    toolUseId,
  };
}

export function extractHops(text: string): readonly AgentHop[] {
  const hops: AgentHop[] = [];
  for (const line of text.split('\n')) {
    // ツール名が文字列として現れない行にメッセージは無い。パースする前にここで落とす
    if (!line.includes(SEND_TOOL)) continue;
    let record: unknown;
    try {
      record = JSON.parse(line);
    } catch {
      // 壊れた行はイベントではない
      continue;
    }
    if (typeof record !== 'object' || record === null || Array.isArray(record)) continue;
    const fields = record as Record<string, unknown>;
    const message = fields.message;
    if (typeof message !== 'object' || message === null || Array.isArray(message)) continue;
    const content = (message as Record<string, unknown>).content;
    if (!Array.isArray(content)) continue;

    for (const block of content) {
      if (typeof block !== 'object' || block === null || Array.isArray(block)) continue;
      const fieldsOfBlock = block as Record<string, unknown>;
      if (fieldsOfBlock.type !== 'tool_use' || fieldsOfBlock.name !== SEND_TOOL) continue;
      const hop = hopOf(fieldsOfBlock, fields);
      if (hop !== null) hops.push(hop);
    }
  }
  return hops;
}

/* 書かれた宛先を、表示しているエージェントの誰かに結び付ける。

   **当てが外れた宛先は捨てる。** 宛先が表示範囲の外の相手なら、こちらの画面で結び付ける先が無い —
   端へ吸着させると、居ない相手と話しているように見える。捨てた数は呼ぶ側が数える。 */
export function placeHop(
  hop: AgentHop,
  ownerId: string,
  addresses: ReadonlyMap<string, string>,
): { readonly fromId: string; readonly toId: string; readonly hop: AgentHop } | null {
  const fromId = hop.fromAgentId === null ? ownerId : (addresses.get(hop.fromAgentId) ?? ownerId);
  const toId = addresses.get(hop.to);
  // 自分宛ては捨てる。名前の付け替えで自分に当たることがある
  if (toId === undefined || toId === fromId) return null;
  return { fromId, toId, hop };
}
