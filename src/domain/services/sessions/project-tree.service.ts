import { mapObserved, type Observation, observed } from '~/app-kernel/observation.ts';
import { pathBasename } from '~/app-kernel/path.ts';
import type {
  ObservedProject,
  ProjectTree,
} from '~/domain/entities/sessions/observed-project.entity.ts';
import type { TranscriptSession } from '~/domain/entities/sessions/session.entity.ts';
import type { SubagentSession } from '~/domain/entities/sessions/subagent.entity.ts';
import type { AgentProcess } from '~/domain/value-objects/sessions/agent-process.value-object.ts';
import { attributeProcesses } from './process-attribution.service.ts';
import { type MergeableProject, mergeProjects } from './project-merge.service.ts';
import { sortByLastActivityDesc, sortByLatestActivityDesc } from './session-ordering.service.ts';
import { deriveSessionStates, isWithinThreshold } from './session-state.service.ts';
import { combineTokens } from './token-usage.service.ts';

/* 読み取った素材を 1 枚の木に組み上げる。ここが導出の総まとめで、外側は何も判断しない。

   組む順に意味がある。**併せてから配る。** 同じ実体の巣が別名で二つに見えている間に
   道具を配ると、片方にしか数えられず、もう片方のセッションが軒並み終わったことになる。 */

/* 直近の窓で使ったトークン。**巣ごとの合計を出すためだけに運ぶ。**

   セッションや子の欄としては外へ出さない。窓の幅は一覧の都合であって、
   セッションそのものの性質ではないからである。 */
interface RecentTokens {
  readonly recentTokens: Observation<number>;
}

/** 様子がまだ付いていない子。様子は書き込みの新しさだけで決まる */
export type DraftSubagent = Omit<SubagentSession, 'state'> & RecentTokens;

/** 様子と待ちがまだ付いていないセッション */
export type DraftSession = Omit<TranscriptSession, 'state' | 'awaiting' | 'subagents'> &
  RecentTokens & {
    /** 末尾の形が「自分の番が終わっている」ものか */
    readonly awaitingCandidate: boolean;
    readonly subagents: readonly DraftSubagent[];
  };

/** 名前ひとつぶんの読み取り結果 */
export interface DraftProject {
  readonly slug: string;
  /* 解決済みの場所。`deriveProjectPath` の答えを解決したものを入れる。

     名前(slug)を解いて場所を得ることはしない。名前は場所の字を潰して作られていて、
     区切りと区切りでない字が同じ形になっているので、元へは戻せない。 */
  readonly canonicalPath: string | null;
  readonly sessions: readonly DraftSession[];
}

/* 巣の場所は、正本に書かれた作業場所から導く。

   **最も新しいセッションから順に見て、最初に見つかった場所を採る。** どのセッションも
   同じ巣を指しているはずだが、場所の書き表し方は時とともに変わり得るので、新しいものを信じる。

   並べる前に探すと答えが変わる。渡す順に頼らずここで並べるのは、そのためである。 */
export function deriveProjectPath(sessions: readonly DraftSession[]): string | null {
  for (const session of sortByLastActivityDesc(sessions)) {
    if (session.cwd !== null && session.cwd !== '') return session.cwd;
  }
  return null;
}

const latestOf = (sessions: readonly DraftSession[]): number =>
  sessions.reduce((latest, session) => Math.max(latest, session.lastActivityMs), 0);

/** セッションと子、正本ひとつひとつの数を並べる。束ね方は `combineTokens` が知っている */
const recentPartsOf = (sessions: readonly DraftSession[]): Observation<number>[] =>
  sessions.flatMap((session) => [
    session.recentTokens,
    ...session.subagents.map((subagent) => subagent.recentTokens),
  ]);

export function buildProjectTree(input: {
  readonly drafts: readonly DraftProject[];
  /* 生きている道具。数えられなかったときも木は組む。
     待機が分からなくなるだけで、セッションそのものは見えている。 */
  readonly processes: Observation<readonly AgentProcess[]>;
  /** 正本の置き場を歩けたか。省くと、渡された名前の数だけ歩けたものとして扱う */
  readonly sources?: Observation<number>;
  readonly nowMs: number;
  readonly activeThresholdMs: number;
}): ProjectTree {
  const { drafts, processes, nowMs, activeThresholdMs } = input;

  // セッションを 1 つも持たない名前は、巣として数えない
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

  /* 帰属は解決済みの場所で測る。OS が教える作業場所は解決済みなので、
     生の字面と突き合わせると、書き表し方の揺れているところで取りこぼす。 */
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
          subagents: sortByLastActivityDesc(session.subagents).map(
            ({ recentTokens: _recent, ...subagent }) => ({
              ...subagent,
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
