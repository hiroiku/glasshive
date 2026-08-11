import { describe, expect, it } from 'vitest';
import {
  extractDeliveries,
  extractHops,
  placeHop,
} from '~/domain/services/sessions/agent-message.service.ts';

/* エージェント間のやり取りは、送った側の `transcript` にだけ `tool_use` として残る。

   受け取った側には本文が届くだけなので、両方から拾うと同じメッセージ 1 通が二度線になる。
   ただし別のセッションへ渡ったメッセージは、送った側と受け取った側で別の `transcript` に
   なる。その 2 本を結べるのは、送った結果と届いた記録の両方に書かれる `msg_id` だけである。 */

const send = (over: Record<string, unknown> = {}, input: Record<string, unknown> = {}) =>
  JSON.stringify({
    agentId: 'aimpl-t10-d5efeea3',
    timestamp: '2026-08-09T12:00:00.000Z',
    message: {
      role: 'assistant',
      content: [
        {
          type: 'tool_use',
          id: 'toolu_01A',
          name: 'SendMessage',
          input: { to: 'team-lead', summary: 'できた', message: '本文', ...input },
        },
      ],
    },
    ...over,
  });

/** 送った結果。呼び出しより後の行に来て、`msg_id` を持つ */
const sendResult = (toolUseId = 'toolu_01A', msgId: string | null = 'be3ecd13') =>
  JSON.stringify({
    type: 'user',
    timestamp: '2026-08-09T12:00:00.200Z',
    message: {
      role: 'user',
      content: [{ type: 'tool_result', tool_use_id: toolUseId, content: [] }],
    },
    toolUseResult: msgId === null ? { success: false } : { success: true, msg_id: msgId },
  });

describe('送信したメッセージを拾う', () => {
  it('宛先と要約と時刻と、その `tool_use` の id を持つ', () => {
    const hops = extractHops(send());

    expect(hops).toEqual([
      {
        atMs: Date.parse('2026-08-09T12:00:00.000Z'),
        fromAgentId: 'aimpl-t10-d5efeea3',
        to: 'team-lead',
        summary: 'できた',
        toolUseId: 'toolu_01A',
        msgId: null,
      },
    ]);
  });

  /* セッション本体が送ったメッセージには送り手が書かれていない。 */
  it('送り手が書かれていなければ null', () => {
    const hops = extractHops(send({ agentId: undefined }));

    expect(hops[0]?.fromAgentId).toBeNull();
  });

  it('他のツールの `tool_use` は拾わない', () => {
    const line = JSON.stringify({
      timestamp: '2026-08-09T12:00:00.000Z',
      message: {
        content: [{ type: 'tool_use', id: 'toolu_01B', name: 'Bash', input: { to: 'x' } }],
      },
    });

    expect(extractHops(line)).toHaveLength(0);
  });

  it('宛先が無いメッセージは線にならないので拾わない', () => {
    expect(extractHops(send({}, { to: '' }))).toHaveLength(0);
  });

  it('時刻が読めないメッセージは拾わない', () => {
    expect(extractHops(send({ timestamp: 'いつか' }))).toHaveLength(0);
  });

  /* 壊れた 1 行はイベントではない。そこで走査を止める理由が無い。 */
  it('壊れた行は飛ばして、その先を読む', () => {
    const hops = extractHops(`{"name":"SendMessage"ここで切れて\n${send()}`);

    expect(hops).toHaveLength(1);
  });

  it('要約が無くても拾う。無いのは要約であってメッセージではない', () => {
    expect(extractHops(send({}, { summary: undefined }))[0]?.summary).toBe('');
  });

  it('空のテキストからは何も出ない', () => {
    expect(extractHops('')).toHaveLength(0);
  });
});

/* 別のセッションへ渡ったメッセージは、送った側と受け取った側で `transcript` が別になる。
   その 2 本を結べるのは `msg_id` だけである —— 名乗る名前はセッションの id でも `slug` でも
   なく、ソケットのパスはプロセスを指すもので、どちらも相手の `transcript` を指せない。 */
describe('送ったメッセージに、両端を結ぶ鍵を持たせる', () => {
  it('送った結果に書かれた `msg_id` を、その呼び出しに結ぶ', () => {
    const hops = extractHops(`${send()}\n${sendResult()}`);

    expect(hops[0]?.msgId).toBe('be3ecd13');
  });

  /* 結果は呼び出しより後の行に在る。読み取り範囲の切れ目に当たると、片方だけが見える。 */
  it('結果が見えていなければ `null`。届いたことにしない', () => {
    expect(extractHops(send())[0]?.msgId).toBeNull();
  });

  it('届かなかった呼び出しの結果からは、鍵を採らない', () => {
    const hops = extractHops(`${send()}\n${sendResult('toolu_01A', null)}`);

    expect(hops[0]?.msgId).toBeNull();
  });

  it('別の呼び出しの結果を取り違えない', () => {
    const hops = extractHops(`${send()}\n${sendResult('toolu_09Z')}`);

    expect(hops[0]?.msgId).toBeNull();
  });
});

/** 別のセッションから届いた記録 1 件 */
const delivery = (origin: Record<string, unknown> = {}) =>
  JSON.stringify({
    type: 'attachment',
    timestamp: '2026-08-09T12:00:01.000Z',
    attachment: {
      type: 'queued_command',
      prompt: '本文',
      origin: {
        kind: 'peer',
        from: 'uds:/tmp/cc-socks/77370.sock',
        name: 'glasshive-clean-arch-port',
        fromMode: 'prompting',
        msg_id: 'be3ecd13',
        body: '本文',
        ...origin,
      },
    },
  });

/* 届いた側の記録。同じ本文は `queue-operation` にも `user` の本文にも現れるが、
   `msg_id` を持つのはここだけである。 */
describe('別のセッションから届いたメッセージを拾う', () => {
  it('鍵と、名乗った名前と、届き方を持つ', () => {
    expect(extractDeliveries(delivery())).toEqual([
      {
        atMs: Date.parse('2026-08-09T12:00:01.000Z'),
        msgId: 'be3ecd13',
        fromName: 'glasshive-clean-arch-port',
        fromAddress: 'uds:/tmp/cc-socks/77370.sock',
        mode: 'prompting',
      },
    ]);
  });

  /* ソケットのパスを持たない記録がある。名前だけでも、届いたことは観測している。 */
  it('送り手の宛先が書かれていなくても拾う', () => {
    expect(extractDeliveries(delivery({ from: undefined }))[0]?.fromAddress).toBeNull();
  });

  /* 届き方は `prompting` 以外を取り得る。取り得るなら別のことなので、潰さずに運ぶ。 */
  it('届き方はそのまま運ぶ', () => {
    expect(extractDeliveries(delivery({ fromMode: 'notify' }))[0]?.mode).toBe('notify');
  });

  it('鍵の無い記録は、結べないので拾わない', () => {
    expect(extractDeliveries(delivery({ msg_id: undefined }))).toHaveLength(0);
  });

  it('時刻が読めない記録は拾わない', () => {
    const line = delivery().replace('2026-08-09T12:00:01.000Z', 'いつか');

    expect(extractDeliveries(line)).toHaveLength(0);
  });

  /* 同じ本文が `queue-operation` にも残る。本文で数えると 1 通が二度になる。 */
  it('本文だけを持つ行は拾わない', () => {
    const queued = JSON.stringify({
      type: 'queue-operation',
      operation: 'enqueue',
      timestamp: '2026-08-09T12:00:01.000Z',
      content: '<cross-session-message from-name="peer">本文</cross-session-message>',
    });

    expect(extractDeliveries(queued)).toHaveLength(0);
  });

  it('送った側の記録は、届いた記録として数えない', () => {
    expect(extractDeliveries(sendResult())).toHaveLength(0);
  });
});

/** 拾えているはずのメッセージを 1 つ取り出す。拾えていなければ、そこで組み立てが誤っている */
const first = (text: string) => {
  const [hop] = extractHops(text);
  if (hop === undefined) throw new Error('メッセージが拾えていない');
  return hop;
};

describe('書かれた宛先の文字列を、観測しているエージェントに結び付ける', () => {
  const addresses = new Map([
    ['team-lead', 'sess-1'],
    ['impl-t10', 'agent-aimpl-t10-d5efeea3'],
    ['aimpl-t10-d5efeea3', 'agent-aimpl-t10-d5efeea3'],
  ]);
  const hop = first(send());

  it('送り手も受け手も、木の中での同一性に置き換わる', () => {
    expect(placeHop(hop, 'sess-1', addresses)).toEqual({
      fromId: 'agent-aimpl-t10-d5efeea3',
      toId: 'sess-1',
      hop,
    });
  });

  /* 送り手が書かれていなければ、その `transcript` の持ち主が送っている。 */
  it('送り手が無いときは、`transcript` の持ち主が送り手になる', () => {
    const own = first(send({ agentId: undefined }, { to: 'impl-t10' }));

    expect(placeHop(own, 'sess-1', addresses)?.fromId).toBe('sess-1');
  });

  /* 端へ吸着させると、居ない相手と話しているように見える。 */
  it('エージェントの一覧に居ない宛先は置かない', () => {
    expect(placeHop(hop, 'sess-1', new Map())).toBeNull();
  });

  it('自分宛ては線にならない', () => {
    expect(placeHop(hop, 'sess-1', new Map([['team-lead', 'sess-1']]))).toBeNull();
  });
});
