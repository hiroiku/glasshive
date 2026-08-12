import { describe, expect, it } from 'vitest';
import { AppError } from '~/app-kernel/error.ts';
import { absent, observed, unobservable } from '~/app-kernel/observation.ts';
import { presentMessages } from '~/interface/presenters/sessions/messages.presenter.ts';

/* エージェント間のメッセージを外部 API の形へ写す。

   **観測できなかったことを空の一覧に潰さない。** 潰すと、やり取りが無かったのか
   観測できなかったのかが、受け取る側から永久に分からなくなる。 */

class ReadError extends AppError {
  readonly code = 'transcript.read_failed';
}

const hop = {
  fromId: 'agent-a1',
  toId: 'sess-1',
  hop: {
    atMs: Date.parse('2026-08-09T12:00:00.500Z'),
    fromAgentId: 'a1',
    to: 'team-lead',
    summary: 'できた',
    toolUseId: 'toolu_01A',
    msgId: null,
  },
};

describe('エージェント間のメッセージの変換', () => {
  it('メッセージ 1 通は時刻と相手と要約を持って出る', () => {
    const presented = presentMessages(
      observed({ hops: [hop], peers: [], complete: true, unplaced: 0, peersComplete: true }),
    );

    expect(presented.hops).toEqual([
      {
        at: '2026-08-09T12:00:00Z',
        from: 'agent-a1',
        to: 'sess-1',
        summary: 'できた',
        tool_use: 'toolu_01A',
      },
    ]);
  });

  it('欄はこれで全部', () => {
    const presented = presentMessages(
      observed({ hops: [], peers: [], complete: true, unplaced: 0, peersComplete: true }),
    );

    expect(Object.keys(presented)).toEqual([
      'state',
      'reason',
      'complete',
      'unplaced',
      'peers_complete',
      'hops',
      'peers',
    ]);
  });

  /* 読み取り範囲が先頭まで届かなかったことは、観測できなかったことと別である。 */
  it('読み取り範囲が届かなかったことを、そのまま伝える', () => {
    const presented = presentMessages(
      observed({ hops: [], peers: [], complete: false, unplaced: 3, peersComplete: true }),
    );

    expect(presented.state).toBe('observed');
    expect(presented.complete).toBe(false);
    expect(presented.unplaced).toBe(3);
  });

  /* 片端しか置けなかったやり取りの相手を、探し切れたか。**探し切れなかったことと、相手が
     居なかったことを同じにしない** —— 潰すと、開かなかったセッションに居た相手が
     「居なかった」ことになる。 */
  it('相手を探し切れなかったことも、そのまま伝える', () => {
    const presented = presentMessages(
      observed({ hops: [], peers: [], complete: true, unplaced: 0, peersComplete: false }),
    );

    expect(presented.peers_complete, '探し切れていないのに、探し切れたことになっている').toBe(
      false,
    );
  });

  it('観測できなかったときは、理由のエラーコードを添えて空で返す', () => {
    const presented = presentMessages(unobservable(new ReadError('だめ')));

    expect(presented.state).toBe('unobservable');
    expect(presented.reason).toBe('transcript.read_failed');
    expect(presented.hops).toEqual([]);
  });

  it('無かったときは、無かった理由をそのまま言う', () => {
    const presented = presentMessages(absent('no-source'));

    expect(presented.state).toBe('absent');
    expect(presented.reason).toBe('no-source');
  });
});

/* 別のセッションとのやり取りは、こちら側の同一性で相手を言えない。
 **言えないことを、無かったことにしない。** */
describe('この画面に居ないセッションとのやり取り', () => {
  const exchange = {
    atMs: Date.parse('2026-08-09T12:00:01.000Z'),
    direction: 'received' as const,
    agentId: 'sess-1',
    peer: 'glasshive-clean-arch-port',
    msgId: 'be3ecd13',
    summary: '',
    mode: 'prompting',
  };

  it('相手が自己申告した名前と、両端を結ぶ鍵ごと出る', () => {
    const presented = presentMessages(
      observed({ hops: [], peers: [exchange], complete: true, unplaced: 0, peersComplete: true }),
    );

    expect(presented.peers).toEqual([
      {
        at: '2026-08-09T12:00:01Z',
        direction: 'received',
        agent: 'sess-1',
        peer: 'glasshive-clean-arch-port',
        msg_id: 'be3ecd13',
        summary: '',
        mode: 'prompting',
      },
    ]);
  });

  /* 届き方が別なら別のことである。「届いた」に潰すと、区別が写す途中で消える。 */
  it('届き方はそのまま運ぶ', () => {
    const presented = presentMessages(
      observed({
        hops: [],
        peers: [{ ...exchange, mode: 'notify' }],
        complete: true,
        unplaced: 0,
        peersComplete: true,
      }),
    );

    expect(presented.peers[0]?.mode).toBe('notify');
  });
});
