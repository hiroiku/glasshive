import type {
  ProjectJson,
  SessionJson,
  SubagentJson,
} from '~/interface/presenters/sessions/tree.presenter.ts';

/* 既定で何を見せるか。

   **これは観測ではなく、見せ方の方針である。** 観測はすべてを持っているが、
   数百の終わったセッションを一度に並べても読めない。だから既定では
   「動いているもの」と「ついさっきまで動いていたもの」だけを出し、
   全部見たい人には見せる。

   ここに在るのは、木を組む側でも画面の側でもなく、写した後の形に掛ける決まりだからである。
   画面ごとに書くと、一覧と表とタブのラベルで「見えている数」が食い違う。 */

/** ここまでの間に動いていれば、終わっていても出す */
export const RECENT_MS = 86_400_000;

/* 1 つのセッションが一度に出す子の上限。

   委譲の多いセッションでは子が数百に達する。全部出すと親が埋もれ、
   木としての読み方(誰が誰に投げたか)が成り立たなくなる。 */
export const MAX_VISIBLE_SUBAGENTS = 8;

const isRecent = (iso: string, nowMs: number): boolean => {
  const atMs = Date.parse(iso);
  // 時刻として読めない文字列は「最近ではない」に倒す。出鱈目な時刻で並びを乱すよりよい
  return Number.isFinite(atMs) && nowMs - atMs < RECENT_MS;
};

export function visibleSessions(
  project: ProjectJson,
  showAll: boolean,
  nowMs: number,
): readonly SessionJson[] {
  if (showAll) return project.sessions;
  return project.sessions.filter(
    (session) => session.state !== 'ended' || isRecent(session.last_activity, nowMs),
  );
}

/* 動いている子は必ず出す。空きがあれば、直近に動いていた子で埋める。

   **並びは元のままにする。** 選び方と並べ方を混ぜると、選んだ順(動いている子が先)が
   そのまま画面の順になり、時間の並びとして読めなくなる。 */
export function visibleSubagents(
  session: SessionJson,
  showAll: boolean,
  nowMs: number,
): readonly SubagentJson[] {
  if (showAll) return session.subagents;
  const keep = new Set(session.subagents.filter((subagent) => subagent.state === 'active'));
  for (const subagent of session.subagents) {
    if (keep.size >= MAX_VISIBLE_SUBAGENTS) break;
    if (subagent.state !== 'active' && isRecent(subagent.last_activity, nowMs)) keep.add(subagent);
  }
  return session.subagents.filter((subagent) => keep.has(subagent));
}

/** プロジェクト 1 つをドット 1 つで言い表す。**応答待ちを最優先に見せる** — 稼働は勝手に進む */
export function projectDotState(project: ProjectJson): string {
  if (project.sessions.some((session) => session.awaiting === 'user')) return 'input';
  if (project.sessions.some((session) => session.state === 'active')) return 'active';
  return project.live_process ? 'waiting' : 'ended';
}
