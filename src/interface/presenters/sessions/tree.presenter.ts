import type { Observation } from '~/app-kernel/observation.ts';
import type {
  ActivityIntervalSet,
  AwaitingKind,
  ObservedProject,
  ProjectTree,
  SessionState,
  SubagentSession,
  SubagentState,
  TranscriptSession,
} from '~/application/use-cases/sessions/observe-tree.use-case.ts';

/* ひと目ぶんの観測を、外の道が読む形へ写す。

   snake_case の名前も、時刻の字面も、ここだけが知っている。内側は camelCase と
   エポックのミリ秒のまま、外の都合を何も知らない。

   写すだけである。数を切り詰めたり、並べ替えたり、上限を掛けたりはしない —
   どれも導出の仕事で、ここでやると同じ判断が二か所に散る。 */

/** 欄ひとつの見え方。`Observation` の三つの様子と同じ字を使う */
export type ObservationState = 'observed' | 'absent' | 'unobservable';

/** 見えなかった欄の言い分。見えたときは理由が無いので `null` */
export interface ObservationStatusJson {
  state: ObservationState;
  reason: string | null;
}

export interface SubagentJson {
  id: string;
  label: string;
  /** 呼ばれ方。呼び名が 16 進の id しか無いとき、役どころはこれでしか読めない */
  agent_type: string | null;
  /** 呼んだ相手の id。セッションが直に呼んだ子では null */
  parent: string | null;
  /* 根から数えた段。セッションが 1 で、その子が 2。
     並びは既に親のすぐ下に揃えてあるので、受け取る側はこれを字下げに使うだけでよい */
  depth: number;
  file: string;
  state: SubagentState;
  /** 正本に書かれていた字面そのまま。数から起こしたものではないので、丸めない */
  started: string | null;
  last_activity: string;
  tokens: number | null;
  /** 数が無いとき、窓の外なのか読めなかったのかを分ける */
  tokens_state: ObservationState;
  model: string | null;
  effort: string | null;
  git_branch: string | null;
  cwd: string | null;
  issue: string | null;
  current: string | null;
  intervals: [string, string][];
  /** 帯が正本の先頭まで届いているか。窓の話であって、読めたかどうかの話ではない */
  intervals_complete: boolean;
  /** 帯が空のとき、静かだったのか読みに行けなかったのかを分ける */
  intervals_state: ObservationState;
}

export interface SessionJson {
  id: string;
  file: string;
  title: string | null;
  state: SessionState;
  awaiting: AwaitingKind | null;
  /** 正本に書かれていた字面そのまま。数から起こしたものではないので、丸めない */
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
  /** 帯が正本の先頭まで届いているか。窓の話であって、読めたかどうかの話ではない */
  intervals_complete: boolean;
  /** 帯が空のとき、静かだったのか読みに行けなかったのかを分ける */
  intervals_state: ObservationState;
  size: number;
  subagents: SubagentJson[];
}

export interface ProjectJson {
  /** 巣を指す名。併せた組の代表 */
  id: string;
  /** 道に載せる平坦な名前。`id` と同じ字 */
  slug: string;
  path: string | null;
  name: string;
  live_process: boolean;
  /** 何本動いているか。真偽だけでは 1 本と数本が同じに見える */
  live_process_count: number;
  /* 直近 24 時間の消費。**一覧はこれを見るので、巣ごとに問い直す必要が無い。** */
  tokens_24h: number | null;
  /** 数が無いとき、静かだったのか読めなかったのかを分ける */
  tokens_24h_state: ObservationState;
  sessions: SessionJson[];
}

export interface TreeJson {
  generated_at: string;
  active_threshold_secs: number;
  /* 正本の置き場を歩けたか。巣が 1 つも無いのと、置き場を読めなかったのは
     どちらも空の一覧になるので、この欄でしか見分けられない。 */
  sources: ObservationStatusJson;
  /* 生きている道具を数えられたか。数えられなくても木は返るので、
     数が 0 なのか数え損ねたのかは、この欄でしか分からない。 */
  processes: ObservationStatusJson;
  projects: ProjectJson[];
}

/* エポックのミリ秒を、秒までの字面にする。

   ミリ秒まで出しても観る人には意味が無く、桁が揺れると目で比べにくい。 */
export const iso = (ms: number): string => new Date(ms).toISOString().replace(/\.\d{3}Z$/, 'Z');

/** 見えなかった理由の名札。無いなら何が無いのか、読めなかったならどの誤りか */
const reasonOf = <T>(observation: Observation<T>): string | null => {
  if (observation.kind === 'absent') return observation.reason;
  if (observation.kind === 'unobservable') return observation.error.code;
  return null;
};

const statusOf = <T>(observation: Observation<T>): ObservationStatusJson => ({
  state: observation.kind,
  reason: reasonOf(observation),
});

/* 見えた数だけを出す。見えなかったときは `null` にし、理由は別の欄で言う。
   ここで 0 を置くと「使っていない」と読まれてしまう。 */
const tokensOf = (tokens: Observation<number>): number | null =>
  tokens.kind === 'observed' ? tokens.value : null;

/** 帯にまつわる 3 欄。並びは `SessionJson` / `SubagentJson` の宣言と同じにしてある */
interface IntervalsJson {
  intervals: [string, string][];
  intervals_complete: boolean;
  intervals_state: ObservationState;
}

/* 帯を写す。**読めたかどうかは観測をそのまま写すだけで、帯の中身から当てない。**

   当てられないからである。静かだった正本も、開けなかった正本も、どちらも空の一覧になる。
   `complete` は「先頭まで届いたか」という窓の話で、読めたかどうかの話ではない —
   末尾 4MiB を読み切って何も無かった正本は `complete: false` だが、ちゃんと読めている。 */
const intervalsOf = (activity: Observation<ActivityIntervalSet>): IntervalsJson => ({
  intervals:
    activity.kind === 'observed'
      ? activity.value.intervals.map((interval): [string, string] => [
          iso(interval.fromMs),
          iso(interval.toMs),
        ])
      : [],
  /* 見えていないものに「先頭まで届いた」とは言えない。true にすると、
     開けなかった正本について「これで全部だ」と言うことになる。 */
  intervals_complete: activity.kind === 'observed' && activity.value.complete,
  intervals_state: activity.kind,
});

const presentSubagent = (subagent: SubagentSession): SubagentJson => ({
  id: subagent.id,
  label: subagent.label,
  agent_type: subagent.agentType,
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

const presentProject = (project: ObservedProject): ProjectJson => ({
  id: project.id,
  slug: project.id,
  path: project.path,
  name: project.name,
  live_process: project.liveProcessCount > 0,
  live_process_count: project.liveProcessCount,
  tokens_24h: tokensOf(project.recentTokens),
  tokens_24h_state: project.recentTokens.kind,
  sessions: project.sessions.map(presentSession),
});

export function presentTree(tree: ProjectTree): TreeJson {
  return {
    generated_at: iso(tree.generatedAtMs),
    // 観る人に見せるのは秒。ミリ秒のままだと桁が読みにくい
    active_threshold_secs: Math.round(tree.activeThresholdMs / 1000),
    sources: statusOf(tree.sources),
    processes: statusOf(tree.processes),
    projects: tree.projects.map(presentProject),
  };
}
