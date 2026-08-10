import { mapObserved, type Observation, observed } from '~/app-kernel/observation.ts';
import { pathBasename } from '~/app-kernel/path.ts';
import type {
  ObservedProject,
  ProjectTree,
} from '~/domain/entities/sessions/observed-project.entity.ts';
import type { TranscriptSession } from '~/domain/entities/sessions/session.entity.ts';
import type { SubagentSession } from '~/domain/entities/sessions/subagent.entity.ts';
import type { AgentProcess } from '~/domain/value-objects/sessions/agent-process.value-object.ts';
import { placeByLineage } from './agent-lineage.service.ts';
import { attributeProcesses } from './process-attribution.service.ts';
import { type MergeableProject, mergeProjects } from './project-merge.service.ts';
import { sortByLastActivityDesc, sortByLatestActivityDesc } from './session-ordering.service.ts';
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
export type DraftSession = Omit<TranscriptSession, 'state' | 'awaiting' | 'subagents'> &
  RecentTokens & {
    /** 末尾の形が「自分の番が終わっている」ものか */
    readonly awaitingCandidate: boolean;
    readonly subagents: readonly DraftSubagent[];
  };

/** slug 1 つぶんの読み取り結果 */
export interface DraftProject {
  readonly slug: string;
  /* 解決済みのパス。`deriveProjectPath` の結果を解決したものを入れる。

     slug からパスを復元することはしない。slug はパスの文字を潰して作られていて、
     区切り文字とそうでない文字が同じ形になっているので、元へは戻せない。 */
  readonly canonicalPath: string | null;
  readonly sessions: readonly DraftSession[];
}

/* プロジェクトのパスは、`transcript` に書かれた作業ディレクトリから導く。

   **最も新しいセッションから順に見て、最初に見つかったパスを採る。** どのセッションも
   同じプロジェクトを指しているはずだが、パスの書き表し方は時とともに変わり得るので、
   新しいものを信じる。

   並べる前に探すと結果が変わる。渡す順に頼らずここで並べるのは、そのためである。 */
export function deriveProjectPath(sessions: readonly DraftSession[]): string | null {
  for (const session of sortByLastActivityDesc(sessions)) {
    if (session.cwd !== null && session.cwd !== '') return session.cwd;
  }
  return null;
}

const latestOf = (sessions: readonly DraftSession[]): number =>
  sessions.reduce((latest, session) => Math.max(latest, session.lastActivityMs), 0);

/** セッションとサブエージェント、`transcript` ひとつひとつの数を並べる。まとめ方は `combineTokens` が知っている */
const recentPartsOf = (sessions: readonly DraftSession[]): Observation<number>[] =>
  sessions.flatMap((session) => [
    session.recentTokens,
    ...session.subagents.map((subagent) => subagent.recentTokens),
  ]);

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

  // セッションを 1 つも持たない slug は、プロジェクトとして数えない
  const mergeable: MergeableProject<DraftSession>[] = drafts
    .filter((draft) => draft.sessions.length > 0)
    .map((draft) => ({
      slug: draft.slug,
      path: deriveProjectPath(draft.sessions),
      canonicalPath: draft.canonicalPath,
      latestActivityMs: latestOf(draft.sessions),
      sessions: draft.sessions,
    }));

  const merged = mergeProjects(mergeable);

  /* 帰属は解決済みのパスで測る。OS が教える作業ディレクトリは解決済みなので、
     生の表記と突き合わせると、書き表し方の揺れているところで取りこぼす。 */
  const counts = attributeProcesses(
    merged.map((project) => project.canonicalPath),
    processes.kind === 'observed' ? processes.value : [],
  );

  const projects: ObservedProject[] = merged.map((project, index) => {
    const sessions = sortByLastActivityDesc(project.sessions);
    const assignments = deriveSessionStates({
      sessions: sessions.map((session) => ({
        lastActivityMs: session.lastActivityMs,
        ownMtimeMs: session.ownMtimeMs,
        awaitingCandidate: session.awaitingCandidate,
        subagentMtimesMs: session.subagents.map((subagent) => subagent.lastActivityMs),
      })),
      liveProcessCount: counts[index] ?? 0,
      nowMs,
      activeThresholdMs,
    });

    return {
      id: project.id,
      slugs: project.slugs,
      path: project.path,
      canonicalPath: project.canonicalPath,
      name: project.path === null ? project.id : pathBasename(project.path),
      liveProcessCount: counts[index] ?? 0,
      latestActivityMs: project.latestActivityMs,
      recentTokens: combineTokens(recentPartsOf(sessions)),
      sessions: sessions.map((session, at) => {
        const { awaitingCandidate, recentTokens, ...rest } = session;
        return {
          ...rest,
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
  });

  return {
    generatedAtMs: nowMs,
    activeThresholdMs,
    sources: input.sources ?? observed(drafts.length),
    processes: mapObserved(processes, (found) => found.length),
    projects: sortByLatestActivityDesc(projects),
  };
}
