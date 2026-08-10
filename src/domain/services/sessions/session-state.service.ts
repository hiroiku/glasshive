/* セッションが今どの状態にあるか、そして誰を待っているかを決める。

   決め手は二つだけ。最後に書かれてからどれだけ経ったかと、そのプロジェクトに
   生きているプロセスがいくつあるかである。どのプロセスがどのセッションのものかは
   外から見分けられないので、稼働しているセッションを先に確定し、余ったプロセスの数だけを
   新しい順に「待機」へ配る。数だけを合わせた見立てであって、対応付けではない。 */

import type {
  AwaitingKind,
  SessionState,
} from '~/domain/value-objects/sessions/session-state.value-object.ts';

/** 閾値の内に書き込みがあったか。境界はちょうどのときも内に含める */
export function isWithinThreshold(nowMs: number, atMs: number, thresholdMs: number): boolean {
  return nowMs - atMs <= thresholdMs;
}

/* トークンを数えに行く価値があるほど新しいか。

   **境界の向きが稼働の判定と違う。** ちょうど対象期間の幅に当たるものは外である。
   稼働の判定に使う `isWithinThreshold` へ `TOKEN_AGE_MS` を渡すと、7 日ちょうどの
   `transcript` の扱いが裏返る。取り違えないよう、別の名前で置いてある。 */
export function isWithinTokenWindow(nowMs: number, atMs: number, windowMs: number): boolean {
  return nowMs - atMs < windowMs;
}

export interface SessionActivityInput {
  /** 自分とサブエージェントのうち最も新しい書き込み */
  readonly lastActivityMs: number;
  /** 自分だけの書き込み */
  readonly ownMtimeMs: number;
  /** 末尾の形が「自分の番が終わっている」ものか */
  readonly awaitingCandidate: boolean;
  readonly subagentMtimesMs: readonly number[];
}

export interface SessionStateAssignment {
  readonly state: SessionState;
  readonly awaiting: AwaitingKind | null;
}

/* 何を待っているかを見分ける。

   サブエージェントが動いていて自分が止まっているなら、待っている相手はサブエージェントで
   ある。自分も動いているならまだ自分の番なので、誰も待っていない。サブエージェントが一つも
   動いていなくて、末尾が自分の番の終わりを表しているときだけ、人の入力待ちと見る。

   **待ちを切るのは `ended` かどうかだけである。** 応答を返した直後のセッションは
   `active` のまま `'user'` を持つ — 稼働と待ちは別の軸で、稼働だから待っていない
   わけではない。 */
function deriveAwaiting(
  session: SessionActivityInput,
  state: SessionState,
  nowMs: number,
  activeThresholdMs: number,
): AwaitingKind | null {
  if (state === 'ended') return null;
  const subsActive = session.subagentMtimesMs.some((at) =>
    isWithinThreshold(nowMs, at, activeThresholdMs),
  );
  const ownActive = isWithinThreshold(nowMs, session.ownMtimeMs, activeThresholdMs);
  // 下の二つは subsActive の真偽で排他なので、どちらを先に置いても結果は変わらない
  if (subsActive && !ownActive) return 'agents';
  if (session.awaitingCandidate && !subsActive) return 'user';
  return null;
}

export function deriveSessionStates(input: {
  /** lastActivityMs の新しい順に並べて渡すこと。待機の枠はこの順に配られる */
  readonly sessions: readonly SessionActivityInput[];
  readonly liveProcessCount: number;
  readonly nowMs: number;
  readonly activeThresholdMs: number;
}): readonly SessionStateAssignment[] {
  const { sessions, liveProcessCount, nowMs, activeThresholdMs } = input;
  const activeCount = sessions.filter((session) =>
    isWithinThreshold(nowMs, session.lastActivityMs, activeThresholdMs),
  ).length;
  let waitingSlots = Math.max(0, liveProcessCount - activeCount);

  return sessions.map((session) => {
    let state: SessionState;
    if (isWithinThreshold(nowMs, session.lastActivityMs, activeThresholdMs)) {
      state = 'active';
    } else if (waitingSlots > 0) {
      waitingSlots--;
      state = 'waiting';
    } else {
      state = 'ended';
    }
    return {
      state,
      awaiting: deriveAwaiting(session, state, nowMs, activeThresholdMs),
    };
  });
}
