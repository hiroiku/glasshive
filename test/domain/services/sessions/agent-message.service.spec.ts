import { describe, expect, it } from 'vitest';
import { extractHops, placeHop } from '~/domain/services/sessions/agent-message.service.ts';

/* エージェント間のやり取りは、送った側の `transcript` にだけ `tool_use` として残る。

   受け取った側には本文が届くだけなので、両方から拾うと同じメッセージ 1 通が二度線になる。 */

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
