import { describe, expect, it } from 'vitest';
import {
  deriveSessionStates,
  isWithinThreshold,
  isWithinTokenWindow,
  type SessionActivityInput,
} from '~/domain/services/sessions/session-state.service.ts';

const SEC = 1000;
const THRESHOLD = 60 * SEC;

/** 起点。ここからの相対で時刻を組む */
const T = 1_000_000;

function session(overrides: Partial<SessionActivityInput> = {}): SessionActivityInput {
  return {
    lastActivityMs: T,
    ownMtimeMs: T,
    awaitingCandidate: false,
    subagentMtimesMs: [],
    ...overrides,
  };
}

function derive(
  sessions: readonly SessionActivityInput[],
  liveProcessCount: number,
  nowMs: number,
) {
  return deriveSessionStates({
    sessions,
    liveProcessCount,
    nowMs,
    activeThresholdMs: THRESHOLD,
  });
}

describe('閾値の内か', () => {
  it('経った時間が閾値より短ければ内', () => {
    expect(isWithinThreshold(T + 10 * SEC, T, THRESHOLD)).toBe(true);
  });

  it('ちょうど閾値のときも内に含める', () => {
    expect(
      isWithinThreshold(T + THRESHOLD, T, THRESHOLD),
      '境界を外にすると、閾値ちょうどで動いているセッションが終了に見える',
    ).toBe(true);
  });

  it('閾値を 1 ミリ秒でも超えたら外', () => {
    expect(isWithinThreshold(T + THRESHOLD + 1, T, THRESHOLD)).toBe(false);
  });
});

describe('三つの様子', () => {
  it('閾値の内なら稼働', () => {
    expect(derive([session()], 0, T + 10 * SEC)[0]?.state).toBe('active');
  });

  it('閾値の外でも、生きているプロセスが余っていれば待機', () => {
    expect(derive([session()], 1, T + 120 * SEC)[0]?.state).toBe('waiting');
  });

  it('閾値の外で、生きているプロセスが無ければ終了', () => {
    expect(derive([session()], 0, T + 120 * SEC)[0]?.state).toBe('ended');
  });

  it('稼働しているセッションがプロセスを使い切っていれば、残りは終了', () => {
    const assigned = derive(
      [session({ lastActivityMs: T + 100 * SEC }), session()],
      1,
      T + 110 * SEC,
    );
    expect(assigned[0]?.state).toBe('active');
    expect(
      assigned[1]?.state,
      '生きているプロセスは稼働している方のものと見るので、待機の枠は残らない',
    ).toBe('ended');
  });

  it('経った時間がちょうど閾値なら稼働。その稼働もプロセスを 1 つ食う', () => {
    const assigned = derive(
      [session({ lastActivityMs: T }), session({ lastActivityMs: T - 300 * SEC })],
      1,
      T + THRESHOLD,
    );
    expect(assigned[0]?.state, '境界を外にすると、閾値ちょうどのセッションが終了に見える').toBe(
      'active',
    );
    expect(
      assigned[1]?.state,
      '境界のものを稼働と数えないと、枠が 1 つ余って古いセッションが待機に化ける',
    ).toBe('ended');
  });
});

describe('待機の枠の配り方', () => {
  it('生きているプロセスの数だけ、渡された順に配る', () => {
    const assigned = derive(
      [session({ lastActivityMs: T }), session({ lastActivityMs: T - 10 * SEC })],
      1,
      T + 120 * SEC,
    );
    expect(assigned[0]?.state, '生きているプロセス 1 つ分だけ、直近のセッションが待機').toBe(
      'waiting',
    );
    expect(assigned[1]?.state, '残りは終了。全部を待機にすると死んだ跡が居座る').toBe('ended');
  });

  it('プロセスが 0 なら、閾値の外は全部終了', () => {
    const assigned = derive([session(), session(), session()], 0, T + 120 * SEC);
    expect(assigned.map((a) => a.state)).toEqual(['ended', 'ended', 'ended']);
  });

  it('プロセスがセッションより多くても、待機になるのはセッションの数まで', () => {
    const assigned = derive([session(), session()], 5, T + 120 * SEC);
    expect(assigned.map((a) => a.state)).toEqual(['waiting', 'waiting']);
  });

  it('枠は稼働ぶんを引いた残りだけを、順に配る', () => {
    const assigned = derive(
      [
        session({ lastActivityMs: T }),
        session({ lastActivityMs: T - 300 * SEC }),
        session({ lastActivityMs: T - 400 * SEC }),
      ],
      2,
      T + 30 * SEC,
    );
    expect(
      assigned.map((a) => a.state),
      '稼働 1 つがプロセスを 1 つ使うので、残る枠は 1 つ。2 つめまでが待機',
    ).toEqual(['active', 'waiting', 'ended']);
  });
});

describe('待っている相手', () => {
  it('子が動いていて自分が止まっていれば、子の完了待ち', () => {
    const assigned = derive(
      [
        session({
          lastActivityMs: T,
          ownMtimeMs: T - 300 * SEC,
          subagentMtimesMs: [T],
        }),
      ],
      0,
      T + 10 * SEC,
    );
    expect(assigned[0]?.state, '子の稼働はセッションの稼働').toBe('active');
    expect(assigned[0]?.awaiting).toBe('agents');
  });

  it('子が動いていても自分が動いていれば、誰も待っていない', () => {
    const assigned = derive(
      [
        session({
          ownMtimeMs: T,
          subagentMtimesMs: [T],
          awaitingCandidate: true,
        }),
      ],
      0,
      T + 10 * SEC,
    );
    expect(assigned[0]?.awaiting, 'まだ自分の番なので、待っているとは言わない').toBe(null);
  });

  it('自分の書き込みがちょうど閾値なら、まだ自分の番と見る', () => {
    const assigned = derive(
      [
        session({
          lastActivityMs: T,
          ownMtimeMs: T - THRESHOLD,
          subagentMtimesMs: [T],
        }),
      ],
      0,
      T,
    );
    expect(
      assigned[0]?.awaiting,
      '自分の稼働も境界を内に含める。外すと、書いた直後のセッションが子待ちに化ける',
    ).toBe(null);
  });

  it('自分の書き込みが閾値を 1 ミリ秒でも超えたら、子の完了待ち', () => {
    const assigned = derive(
      [
        session({
          lastActivityMs: T,
          ownMtimeMs: T - THRESHOLD - 1,
          subagentMtimesMs: [T],
        }),
      ],
      0,
      T,
    );
    expect(assigned[0]?.awaiting).toBe('agents');
  });

  it('自分も子も止まっていて、末尾が自分の番の終わりなら、人の入力待ち', () => {
    const assigned = derive(
      [session({ awaitingCandidate: true, subagentMtimesMs: [T - 300 * SEC] })],
      1,
      T + 65 * SEC,
    );
    expect(assigned[0]?.state).toBe('waiting');
    expect(assigned[0]?.awaiting).toBe('user');
  });

  it('稼働していても、末尾が自分の番の終わりなら人の入力待ち', () => {
    const assigned = derive([session({ awaitingCandidate: true })], 0, T + 10 * SEC);
    expect(assigned[0]?.state).toBe('active');
    expect(
      assigned[0]?.awaiting,
      '待ちを切るのは終了かどうかだけ。答えた直後は「稼働のまま人を待つ」',
    ).toBe('user');
  });

  it('末尾が自分の番の途中なら、待ってはいない', () => {
    const assigned = derive([session({ awaitingCandidate: false })], 1, T + 65 * SEC);
    expect(assigned[0]?.state).toBe('waiting');
    expect(assigned[0]?.awaiting, '末尾が道具の呼び出しなら応答待ちではない').toBe(null);
  });

  it('子が動いているうちは、末尾が完結していても人の入力待ちにしない', () => {
    const assigned = derive(
      [
        session({
          ownMtimeMs: T - 300 * SEC,
          awaitingCandidate: true,
          subagentMtimesMs: [T],
        }),
      ],
      0,
      T + 10 * SEC,
    );
    expect(
      assigned[0]?.awaiting,
      // 効いているのは判定の順ではなく `user` 側の「子も止まっている」の見張りである。
      // 二つの枝は subsActive の真偽で排他なので、入れ替えても答えは変わらない。
      '子が動いている間は人を呼ばない。人待ちは子が止まっていることを要る',
    ).toBe('agents');
  });

  it('終了したセッションは、末尾が完結していても何も待たない', () => {
    // 子も一緒に古い。終了の判定が人待ちより先に来ることだけを見る
    const assigned = derive(
      [session({ awaitingCandidate: true, subagentMtimesMs: [T] })],
      0,
      T + 600 * SEC,
    );
    expect(assigned[0]?.state).toBe('ended');
    expect(assigned[0]?.awaiting, '死んだセッションを待ち行列に並べない').toBe(null);
  });
});

describe('渡すものが無いとき', () => {
  it('セッションが無ければ何も返らない', () => {
    expect(derive([], 3, T)).toEqual([]);
  });
});

describe('トークンを数えに行く窓', () => {
  it('境界の向きが稼働の判定と裏返っている', () => {
    const week = 7 * 86_400_000;
    expect(isWithinTokenWindow(week, 0, week), '窓の幅ちょうどは外').toBe(false);
    expect(isWithinThreshold(week, 0, week), '稼働の判定では、閾値ちょうどは内').toBe(true);
  });

  it('窓の内なら数えに行く', () => {
    const week = 7 * 86_400_000;
    expect(isWithinTokenWindow(week - 1, 0, week)).toBe(true);
    expect(isWithinTokenWindow(week + 1, 0, week)).toBe(false);
  });
});
