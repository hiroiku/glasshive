import type { Observation } from '~/app-kernel/observation.ts';
import type {
  ActivityIntervalSet,
  AwaitingKind,
  ObservedProject,
  ProjectIndex,
  ProjectStub,
  ProjectTree,
  SessionState,
  SubagentSession,
  SubagentState,
  TranscriptSession,
} from '~/application/use-cases/sessions/observe-tree.use-case.ts';

/* 観測した木を、外部 API が読む形へ写す。

   snake_case の名前も、時刻の表記も、ここだけが知っている。内側は camelCase と
   エポックのミリ秒のまま、外の都合を何も知らない。

   写すだけである。数を切り詰めたり、並べ替えたり、上限を掛けたりはしない —
   どれも導出の仕事で、ここでやると同じ判断が二か所に散る。 */

/** 欄ひとつの見え方。`Observation` の三つの状態と同じ文字列を使う */
export type ObservationState = 'observed' | 'absent' | 'unobservable';

/** 観測できなかった欄の理由。観測できたときは理由が無いので `null` */
export interface ObservationStatusJson {
  state: ObservationState;
  reason: string | null;
}

export interface SubagentJson {
  id: string;
  label: string;
  /** 呼ばれ方。ラベルが 16 進の id しか無いとき、役どころはこれでしか読めない */
  agent_type: string | null;
  /** 呼びかけに使う名。子どうしはこの名前で互いを呼ぶ */
  name: string | null;
  /** どの `tool_use` から生まれたか */
  tool_use: string | null;
  /** 呼んだ相手の id。セッションが直に呼んだ子では null */
  parent: string | null;
  /* 根から数えた深さ。セッションが 1 で、その子が 2。
     並びは既に親のすぐ下に揃えてあるので、受け取る側はこれを字下げに使うだけでよい */
  depth: number;
  file: string;
  state: SubagentState;
  /** `transcript` に書かれていた表記そのまま。数から起こしたものではないので、丸めない */
  started: string | null;
  last_activity: string;
  tokens: number | null;
  /** 数が無いとき、読み取り範囲の外なのか読めなかったのかを分ける */
  tokens_state: ObservationState;
  model: string | null;
  effort: string | null;
  git_branch: string | null;
  cwd: string | null;
  issue: string | null;
  current: string | null;
  intervals: [string, string][];
  /** 稼働区間が `transcript` の先頭まで届いているか。読み取り範囲の話であって、読めたかどうかの話ではない */
  intervals_complete: boolean;
  /** 稼働区間が空のとき、静かだったのか観測できなかったのかを分ける */
  intervals_state: ObservationState;
}

export interface SessionJson {
  id: string;
  file: string;
  title: string | null;
  state: SessionState;
  awaiting: AwaitingKind | null;
  /** `transcript` に書かれていた表記そのまま。数から起こしたものではないので、丸めない */
  started: string | null;
  last_activity: string;
  tokens: number | null;
  tokens_state: ObservationState;
  model: string | null;
  effort: string | null;
  git_branch: string | null;
  cwd: string | null;
  actor: string | null;
  issues: string[];
  current: string | null;
  intervals: [string, string][];
  /** 稼働区間が `transcript` の先頭まで届いているか。読み取り範囲の話であって、読めたかどうかの話ではない */
  intervals_complete: boolean;
  /** 稼働区間が空のとき、静かだったのか観測できなかったのかを分ける */
  intervals_state: ObservationState;
  size: number;
  subagents: SubagentJson[];
}

export interface ProjectJson {
  /** プロジェクトを指す名。1 つにまとめた組の代表 */
  id: string;
  /** URL に載せる平坦な名前。`id` と同じ文字列 */
  slug: string;
  path: string | null;
  name: string;
  live_process: boolean;
  /** 何本動いているか。真偽だけでは 1 本と数本が同じに見える */
  live_process_count: number;
  /* 直近 24 時間の消費。**一覧はこれを見るので、プロジェクトごとに問い直す必要が無い。** */
  tokens_24h: number | null;
  /** 数が無いとき、静かだったのか観測できなかったのかを分ける */
  tokens_24h_state: ObservationState;
  /* この行の中身を読み終えているか。**読む前と読んだ後を、画面が見分けられるようにする。**

     読む前の行にも `id` も名前もパスも入っている(索引で確定している)が、セッションは空で
     数値は `null` である。この欄が無いと、画面はそれを「静かなプロジェクト」として描く —
     まだ観測していないことを、何も動いていないことと言い換えてしまう。 */
  read: boolean;
  sessions: SessionJson[];
}

export interface TreeJson {
  generated_at: string;
  active_threshold_secs: number;
  /* `~/.claude/projects` を走査できたか。プロジェクトが 1 つも無いのと、走査できなかったのは
     どちらも空の一覧になるので、この欄でしか見分けられない。 */
  sources: ObservationStatusJson;
  /* 生きているプロセスを数えられたか。数えられなくても木は返るので、
     数が 0 なのか数え損ねたのかは、この欄でしか分からない。 */
  processes: ObservationStatusJson;
  /* 全部の行を読み終えたか。**`false` の間、この木から数えたものは断定に使えない。**

     並んでいる行そのものは索引で確定しているので増えも減りもしないが、1 行ごとの数値は
     まだ揃っていない。合計も絞り込みも並べ替えも、読み終えた行しか見ていない。 */
  complete: boolean;
  /* どこまで読んだか。読み終えていれば `null`。

     数えるのは `transcript` の本数である。**バイト数では数えない** — 読み取り範囲に上限が
     掛かっているので、読む量はファイルの大きさに比例しない。 */
  progress: TreeProgressJson | null;
  projects: ProjectJson[];
}

/** 読み終えた `transcript` の数と、索引が数えた総数 */
export interface TreeProgressJson {
  read_transcripts: number;
  total_transcripts: number;
}

/* ストリームに流れる 1 つ。

   **木が丸ごと 1 枚、必ず先に来る。** そこに行が全部入っているので、後から届く
   プロジェクトは既に在る行を埋めるだけになり、行が増えも減りも改名もしない。

   `tree` が運ぶのは、まだ中身を読んでいない索引のときと、覚えていた 1 枚をそのまま
   返すときの両方である。どちらなのかは `TreeJson.complete` が言う。 */
export type TreeChunkJson =
  | { kind: 'tree'; tree: TreeJson }
  | {
      kind: 'project';
      project: ProjectJson;
      read_transcripts: number;
      total_transcripts: number;
    }
  | { kind: 'complete' };

/* エポックのミリ秒を、秒までの表記にする。

   ミリ秒まで出してもユーザーには意味が無く、桁が揺れると目で比べにくい。 */
export const iso = (ms: number): string => new Date(ms).toISOString().replace(/\.\d{3}Z$/, 'Z');

/** 理由を 1 つの文字列で返す。`absent` なら何が無いのか、`unobservable` ならエラーコード */
const reasonOf = <T>(observation: Observation<T>): string | null => {
  if (observation.kind === 'absent') return observation.reason;
  if (observation.kind === 'unobservable') return observation.error.code;
  return null;
};

const statusOf = <T>(observation: Observation<T>): ObservationStatusJson => ({
  state: observation.kind,
  reason: reasonOf(observation),
});

/* 観測できた数だけを出す。観測できなかったときは `null` にし、理由は別の欄で言う。
   ここで 0 を置くと「使っていない」と読まれてしまう。 */
const tokensOf = (tokens: Observation<number>): number | null =>
  tokens.kind === 'observed' ? tokens.value : null;

/** 稼働区間にまつわる 3 欄。並びは `SessionJson` / `SubagentJson` の宣言と同じにしてある */
interface IntervalsJson {
  intervals: [string, string][];
  intervals_complete: boolean;
  intervals_state: ObservationState;
}

/* 稼働区間を写す。**読めたかどうかは観測をそのまま写すだけで、区間の中身から当てない。**

   当てられないからである。静かだった `transcript` も、開けなかった `transcript` も、
   どちらも空の一覧になる。`complete` は「先頭まで届いたか」という読み取り範囲の話で、
   読めたかどうかの話ではない — 末尾 4MiB を読み切って何も無かった `transcript` は
   `complete: false` だが、ちゃんと読めている。 */
const intervalsOf = (activity: Observation<ActivityIntervalSet>): IntervalsJson => ({
  intervals:
    activity.kind === 'observed'
      ? activity.value.intervals.map((interval): [string, string] => [
          iso(interval.fromMs),
          iso(interval.toMs),
        ])
      : [],
  /* 見えていないものに「先頭まで届いた」とは言えない。true にすると、
     開けなかった `transcript` について「これで全部だ」と言うことになる。 */
  intervals_complete: activity.kind === 'observed' && activity.value.complete,
  intervals_state: activity.kind,
});

const presentSubagent = (subagent: SubagentSession): SubagentJson => ({
  id: subagent.id,
  label: subagent.label,
  agent_type: subagent.agentType,
  name: subagent.name,
  tool_use: subagent.toolUseId,
  parent: subagent.parentId,
  depth: subagent.depth,
  file: subagent.file,
  state: subagent.state,
  started: subagent.startedRaw,
  last_activity: iso(subagent.lastActivityMs),
  tokens: tokensOf(subagent.tokens),
  tokens_state: subagent.tokens.kind,
  model: subagent.model,
  effort: subagent.effort,
  git_branch: subagent.gitBranch,
  cwd: subagent.cwd,
  issue: subagent.issue,
  current: subagent.current,
  ...intervalsOf(subagent.activity),
});

const presentSession = (session: TranscriptSession): SessionJson => ({
  id: session.id,
  file: session.file,
  title: session.title,
  state: session.state,
  awaiting: session.awaiting,
  started: session.startedRaw,
  last_activity: iso(session.lastActivityMs),
  tokens: tokensOf(session.tokens),
  tokens_state: session.tokens.kind,
  model: session.model,
  effort: session.effort,
  git_branch: session.gitBranch,
  cwd: session.cwd,
  actor: session.actor,
  issues: [...session.issues],
  current: session.current,
  ...intervalsOf(session.activity),
  size: session.sizeBytes,
  subagents: session.subagents.map(presentSubagent),
});

export const presentProject = (project: ObservedProject): ProjectJson => ({
  id: project.id,
  slug: project.id,
  path: project.path,
  name: project.name,
  live_process: project.liveProcessCount > 0,
  live_process_count: project.liveProcessCount,
  tokens_24h: tokensOf(project.recentTokens),
  tokens_24h_state: project.recentTokens.kind,
  read: true,
  sessions: project.sessions.map(presentSession),
});

/* 中身を読む前の行。**識別だけが入っていて、数値は入っていない。**

   `tokens_24h` に `0` を置かない。読んでいないことを「消費が無かった」と書くのは、
   `absent` と `unobservable` の取り違えが欄の中で起きているのと同じである。 */
const presentStub = (stub: ProjectStub): ProjectJson => ({
  id: stub.id,
  slug: stub.id,
  path: stub.path,
  name: stub.name,
  live_process: stub.liveProcessCount > 0,
  live_process_count: stub.liveProcessCount,
  tokens_24h: null,
  tokens_24h_state: 'absent',
  read: false,
  sessions: [],
});

/* 索引 1 枚を、まだ 1 行も読んでいない木として写す。

   **`active_threshold_secs` を捏造しない。** 索引もこの値を持っているので、そのまま写す。 */
export function presentIndexTree(index: ProjectIndex): TreeJson {
  const total = index.stubs.reduce((sum, stub) => sum + stub.transcriptCount, 0);
  return {
    generated_at: iso(index.generatedAtMs),
    active_threshold_secs: Math.round(index.activeThresholdMs / 1000),
    sources: statusOf(index.sources),
    processes: statusOf(index.processes),
    complete: false,
    progress: { read_transcripts: 0, total_transcripts: total },
    projects: index.stubs.map(presentStub),
  };
}

export function presentTree(tree: ProjectTree): TreeJson {
  return {
    generated_at: iso(tree.generatedAtMs),
    // ユーザーに見せるのは秒。ミリ秒のままだと桁が読みにくい
    active_threshold_secs: Math.round(tree.activeThresholdMs / 1000),
    sources: statusOf(tree.sources),
    processes: statusOf(tree.processes),
    // 1 枚で返す経路は、返した時点で全部を読み終えている
    complete: true,
    progress: null,
    projects: tree.projects.map(presentProject),
  };
}
