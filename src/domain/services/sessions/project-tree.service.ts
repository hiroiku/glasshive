import { mapObserved, type Observation, observed } from '~/app-kernel/observation.ts';
import type {
  ObservedProject,
  ProjectTree,
} from '~/domain/entities/sessions/observed-project.entity.ts';
import type { TranscriptSession } from '~/domain/entities/sessions/session.entity.ts';
import type { SubagentSession } from '~/domain/entities/sessions/subagent.entity.ts';
import type { AgentProcess } from '~/domain/value-objects/sessions/agent-process.value-object.ts';
import { placeByLineage } from './agent-lineage.service.ts';
import { deriveGroupPath, type IndexedProject, indexProjects } from './project-index.service.ts';
import { sortByLastActivityDesc } from './session-ordering.service.ts';
import { deriveSessionStates, isWithinThreshold } from './session-state.service.ts';
import { combineTokens } from './token-usage.service.ts';

/* 読み取った素材を 1 枚の木に組み上げる。ここが導出の総まとめで、外側は何も判断しない。

   組む順に意味がある。**まとめてから配る。** 同じプロジェクトが別の slug で二つに見えて
   いる間にプロセスを配ると、片方にしか数えられず、もう片方のセッションが軒並み終わった
   ことになる。 */

/* 直近の対象期間に使ったトークン。**プロジェクトごとの合計を出すためだけに運ぶ。**

   セッションやサブエージェントの欄としては外へ出さない。集計期間の長さは一覧の都合であって、
   セッションそのものの性質ではないからである。 */
interface RecentTokens {
  readonly recentTokens: Observation<number>;
}

/** 状態がまだ付いていないサブエージェント。状態は書き込みの新しさだけで決まる */
export type DraftSubagent = Omit<SubagentSession, 'state'> & RecentTokens;

/** 状態と待ちがまだ付いていないセッション */
export type DraftSession = Omit<
  TranscriptSession,
  'state' | 'awaiting' | 'subagents' | 'subagentsWalked'
> &
  RecentTokens & {
    /** 末尾の形が「自分の番が終わっている」ものか */
    readonly awaitingCandidate: boolean;
    readonly subagents: readonly DraftSubagent[];
    /* 子のディレクトリを走査できたか。省くと、見えた子のぶんだけ走査できたものとして扱う。

       走査したのは `transcript` をパースするより前なので、下書きを組む側はこれを知らない
       ことがある。知っている側が添える。 */
    readonly subagentsWalked?: Observation<number>;
  };

/** slug 1 つぶんの読み取り結果 */
export interface DraftProject {
  readonly slug: string;
  /* 解決済みのパス。`deriveProjectPath` の結果を解決したものを入れる。

     slug からパスを復元することはしない。slug はパスの文字を潰して作られていて、
     区切り文字とそうでない文字が同じ形になっているので、元へは戻せない。 */
  readonly canonicalPath: string | null;
  readonly sessions: readonly DraftSession[];
  /** この slug のディレクトリを走査できたか。省くと、見えたセッションのぶんだけ走査できたものとして扱う */
  readonly walked?: Observation<number>;
}

/* プロジェクトのパスは、`transcript` に書かれた作業ディレクトリから導く。

   導き方そのものは索引と同じである。**同じ問いに二度答えない** — 索引が言うパスと木が
   言うパスが違えば、行の識別が途中で入れ替わる。 */
export const deriveProjectPath = deriveGroupPath;

/* 走査の結果を、消費の合計に混ぜられる形にする。**数としては 0 を足し、読めなかったことだけを運ぶ。**

   歩けなかったディレクトリの中に何本の `transcript` が居たかは分からない。そこを
   `observed(0)` のまま合計へ通すと、見に行けなかったことが「消費が無かった」と言い切られる。 */
const asZero = (walked: Observation<number>): Observation<number> => mapObserved(walked, () => 0);

/** セッションとサブエージェント、`transcript` ひとつひとつの数を並べる。まとめ方は `combineTokens` が知っている */
const recentPartsOf = (
  walked: Observation<number>,
  sessions: readonly DraftSession[],
): Observation<number>[] => [
  asZero(walked),
  ...sessions.flatMap((session) => [
    ...(session.subagentsWalked === undefined ? [] : [asZero(session.subagentsWalked)]),
    session.recentTokens,
    ...session.subagents.map((subagent) => subagent.recentTokens),
  ]),
];

export function buildProjectTree(input: {
  readonly drafts: readonly DraftProject[];
  /* 生きているプロセス。数えられなかったときも木は組む。
     待機が分からなくなるだけで、セッションそのものは観測できている。 */
  readonly processes: Observation<readonly AgentProcess[]>;
  /** `~/.claude/projects` を走査できたか。省くと、渡された slug の数だけ走査できたものとして扱う */
  readonly sources?: Observation<number>;
  readonly nowMs: number;
  readonly activeThresholdMs: number;
}): ProjectTree {
  const { drafts, processes, nowMs, activeThresholdMs } = input;

  const indexed = indexProjects({
    groups: drafts,
    processes: processes.kind === 'observed' ? processes.value : [],
  });

  const projects: ObservedProject[] = indexed.map((project) =>
    buildObservedProject(project, nowMs, activeThresholdMs),
  );

  return {
    generatedAtMs: nowMs,
    activeThresholdMs,
    sources: input.sources ?? observed(drafts.length),
    processes: mapObserved(processes, (found) => found.length),
    projects,
  };
}

/* 束ねて数え終えたプロジェクト 1 つを、観測できたプロジェクトに仕立てる。

   **この関数はプロジェクト 1 つの中で閉じている。** 状態の割り当ても子の系統も、外の
   プロジェクトを一切見ない。だから 1 つずつ配ってよく、途中で描いた木がどれも真になる。 */
export function buildObservedProject(
  project: IndexedProject<DraftSession>,
  nowMs: number,
  activeThresholdMs: number,
): ObservedProject {
  const sessions = sortByLastActivityDesc(project.sessions);
  const assignments = deriveSessionStates({
    sessions: sessions.map((session) => ({
      lastActivityMs: session.lastActivityMs,
      ownMtimeMs: session.ownMtimeMs,
      awaitingCandidate: session.awaitingCandidate,
      subagentMtimesMs: session.subagents.map((subagent) => subagent.lastActivityMs),
    })),
    liveProcessCount: project.liveProcessCount,
    nowMs,
    activeThresholdMs,
  });

  return {
    id: project.id,
    slugs: project.slugs,
    path: project.path,
    canonicalPath: project.canonicalPath,
    name: project.name,
    liveProcessCount: project.liveProcessCount,
    latestActivityMs: project.latestActivityMs,
    recentTokens: combineTokens(recentPartsOf(project.walked, sessions)),
    walked: project.walked,
    sessions: sessions.map((session, at) => {
      const { awaitingCandidate, recentTokens, subagentsWalked, ...rest } = session;
      return {
        ...rest,
        subagentsWalked: subagentsWalked ?? observed(session.subagents.length),
        state: assignments[at]?.state ?? 'ended',
        awaiting: assignments[at]?.awaiting ?? null,
        /* 新しい順に並べてから、呼んだ親の下へ入れ直す。**順序が先で、木が後である。**
             入れ直した後に並べ替えると親子が離れ、深さだけが残って読めなくなる。
             `placeByLineage` は兄弟どうしの順を渡されたまま保つので、この順で通せば
             「兄弟の中では新しいものが上、子は親のすぐ下」の両方が立つ。 */
        subagents: placeByLineage(sortByLastActivityDesc(session.subagents)).map(
          ({ node: { recentTokens: _recent, ...subagent }, depth }) => ({
            ...subagent,
            depth,
            state: isWithinThreshold(nowMs, subagent.lastActivityMs, activeThresholdMs)
              ? ('active' as const)
              : ('ended' as const),
          }),
        ),
      };
    }),
  };
}
