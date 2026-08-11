import type {
  AgentDelivery,
  AgentHop,
} from '~/domain/value-objects/sessions/agent-message.value-object.ts';

/* `transcript` のテキストから、メッセージのやり取りを拾う。**純関数。**

   送った側の `transcript` には `tool_use` として残り、送った結果に `msg_id` が付く。
   別のセッションへ渡ったメッセージは、受け取った側の `transcript` にも同じ `msg_id` が
   書かれる —— **両端を結べるのはこの文字列だけである。** 名乗る名前はセッションの id でも
   `slug` でもなく、ソケットのパスはプロセスを指すもので、どちらも相手を指せない。

   壊れた行は飛ばす。読めない 1 行はイベントではないので、そこで走査を止める理由が無い。

   ツール名や欄の名前で早期に絞り込むのは、`transcript` が数 MiB あるからである。ほとんどの行は
   メッセージと関わりが無く、その全部をパースすると画面を開くたびに機械が止まる。 */

const SEND_TOOL = 'SendMessage';

/** 送った結果と、受け取った側の記録の両方に現れる欄の名前 */
const MESSAGE_ID = 'msg_id';

const textOf = (value: unknown): string => (typeof value === 'string' ? value : '');

const recordOf = (value: unknown): Record<string, unknown> | null =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;

/** 1 行を読む。壊れた行はイベントではないので `null` */
function lineOf(line: string): Record<string, unknown> | null {
  try {
    return recordOf(JSON.parse(line));
  } catch {
    return null;
  }
}

/** メッセージ 1 通の中身。宛先が空なら、どこへ送られたのかが決まらないので数えない */
function hopOf(block: Record<string, unknown>, record: Record<string, unknown>): AgentHop | null {
  const input = recordOf(block.input);
  if (input === null) return null;
  const to = textOf(input.to);
  const toolUseId = textOf(block.id);
  if (to === '' || toolUseId === '') return null;

  const atMs = Date.parse(textOf(record.timestamp));
  if (!Number.isFinite(atMs)) return null;

  return {
    atMs,
    fromAgentId: textOf(record.agentId) === '' ? null : textOf(record.agentId),
    to,
    summary: textOf(input.summary),
    toolUseId,
    msgId: null,
  };
}

/* 送った結果に書かれた `msg_id`。`tool_use` の id で引けるようにして返す。

   結果は呼び出しより後の行に在る。**先に集めてから結ぶ** —— 行の順に頼って片方だけを
   持つと、読み取り範囲の切れ目に当たった呼び出しが id を持たないまま出る。 */
function messageIdsOf(lines: readonly string[]): ReadonlyMap<string, string> {
  const ids = new Map<string, string>();
  for (const line of lines) {
    if (!line.includes(MESSAGE_ID)) continue;
    const record = lineOf(line);
    if (record === null) continue;
    const result = recordOf(record.toolUseResult);
    const msgId = result === null ? '' : textOf(result[MESSAGE_ID]);
    if (msgId === '') continue;
    /* どの呼び出しの結果かは `tool_result` の側にしか書かれていない。
       `toolUseResult` は同じ行の中身を写したものなので、id はこちらから採る。 */
    const message = recordOf(record.message);
    const content = message === null ? null : message.content;
    if (!Array.isArray(content)) continue;
    for (const block of content) {
      const fields = recordOf(block);
      if (fields === null || fields.type !== 'tool_result') continue;
      const toolUseId = textOf(fields.tool_use_id);
      if (toolUseId !== '') ids.set(toolUseId, msgId);
    }
  }
  return ids;
}

export function extractHops(text: string): readonly AgentHop[] {
  const lines = text.split('\n');
  const ids = messageIdsOf(lines);
  const hops: AgentHop[] = [];
  for (const line of lines) {
    // ツール名が文字列として現れない行にメッセージは無い。パースする前にここで落とす
    if (!line.includes(SEND_TOOL)) continue;
    const fields = lineOf(line);
    if (fields === null) continue;
    const message = recordOf(fields.message);
    const content = message === null ? null : message.content;
    if (!Array.isArray(content)) continue;

    for (const block of content) {
      const fieldsOfBlock = recordOf(block);
      if (fieldsOfBlock === null) continue;
      if (fieldsOfBlock.type !== 'tool_use' || fieldsOfBlock.name !== SEND_TOOL) continue;
      const hop = hopOf(fieldsOfBlock, fields);
      if (hop !== null) hops.push({ ...hop, msgId: ids.get(hop.toolUseId) ?? null });
    }
  }
  return hops;
}

/* 別のセッションから届いたメッセージを拾う。

   届いた側の記録は `attachment` で、`origin` に送り手が名乗った名前・届き方・`msg_id` が
   構造のまま入っている。**同じ本文は `queue-operation` にも `user` の本文にも現れるが、
   `msg_id` を持つのはここだけである。** 本文の一致で結ぼうとすると、同じ本文を続けて
   別の相手へ送ったときに、観測していない対応を作ることになる。 */
export function extractDeliveries(text: string): readonly AgentDelivery[] {
  const deliveries: AgentDelivery[] = [];
  for (const line of text.split('\n')) {
    if (!line.includes(MESSAGE_ID)) continue;
    const record = lineOf(line);
    if (record === null) continue;
    const attachment = recordOf(record.attachment);
    const origin = attachment === null ? null : recordOf(attachment.origin);
    if (origin === null) continue;
    const msgId = textOf(origin[MESSAGE_ID]);
    if (msgId === '') continue;

    const atMs = Date.parse(textOf(record.timestamp));
    if (!Number.isFinite(atMs)) continue;

    deliveries.push({
      atMs,
      msgId,
      fromName: textOf(origin.name) === '' ? null : textOf(origin.name),
      fromAddress: textOf(origin.from) === '' ? null : textOf(origin.from),
      mode: textOf(origin.fromMode) === '' ? null : textOf(origin.fromMode),
    });
  }
  return deliveries;
}

/* ソケットで名指した宛先。プロセスを指すもので、相手の同一性ではない */
const SOCKET_ADDRESS = /^uds:/;

/* 書かれた宛先のうち、相手を名指していると言えるぶん。言えなければ `null`。

   **ソケットのパスを相手の名前として出さない。** ソケットはプロセスを指すもので、
   プロセスが終われば使い回される —— 別のセッションを同じ相手として読ませることになる。 */
export function peerNameOf(to: string): string | null {
  const trimmed = to.trim();
  if (trimmed === '' || SOCKET_ADDRESS.test(trimmed)) return null;
  return trimmed;
}

/* 送ったのは誰か。**送り手が書かれていなければ、その `transcript` の持ち主である。**
   宛先が誰にも当たらなかったメッセージでも、送った側はこちらの画面に居る。 */
export function senderOf(
  hop: AgentHop,
  ownerId: string,
  addresses: ReadonlyMap<string, string>,
): string {
  return hop.fromAgentId === null ? ownerId : (addresses.get(hop.fromAgentId) ?? ownerId);
}

/* 書かれた宛先を、表示しているエージェントの誰かに結び付ける。

   **当てが外れた宛先は捨てる。** 宛先が表示範囲の外の相手なら、こちらの画面で結び付ける先が無い —
   端へ吸着させると、居ない相手と話しているように見える。捨てた数は呼ぶ側が数える。 */
export function placeHop(
  hop: AgentHop,
  ownerId: string,
  addresses: ReadonlyMap<string, string>,
): { readonly fromId: string; readonly toId: string; readonly hop: AgentHop } | null {
  const fromId = senderOf(hop, ownerId, addresses);
  const toId = addresses.get(hop.to);
  // 自分宛ては捨てる。名前の付け替えで自分に当たることがある
  if (toId === undefined || toId === fromId) return null;
  return { fromId, toId, hop };
}
