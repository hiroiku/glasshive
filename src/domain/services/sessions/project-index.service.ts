import { mapObserved, type Observation, observed, unobservable } from '~/app-kernel/observation.ts';
import { pathBasename } from '~/app-kernel/path.ts';
import type {
  ProjectIndex,
  ProjectStub,
} from '~/domain/entities/sessions/observed-project.entity.ts';
import { TranscriptWalkIncompleteError } from '~/domain/errors/sessions/transcript-walk.error.ts';
import type { AgentProcess } from '~/domain/value-objects/sessions/agent-process.value-object.ts';
import { attributeProcesses } from './process-attribution.service.ts';
import {
  type MergeableProject,
  type MergedProject,
  mergeProjects,
} from './project-merge.service.ts';
import { sortByLastActivityDesc, sortByLatestActivityDesc } from './session-ordering.service.ts';

/* 行がどれで、どこに在って、いくつプロセスが動いているかを決める。

   **中身を読む前に決まることだけを決める。** ここで決まるのは行の識別 — `id`・名前・パス・
   帰属したプロセスの数・並び順である。1 行ごとの数値は入らない。

   この分け方に意味があるのは、識別が**プロジェクト 1 つでは決まらない**からである。
   `mergeProjects` は同じ解決済みパスを持つ slug を束ねて代表を辞書順で選ぶので、後から
   別の slug が現れれば `id` も名前も変わる。`attributeProcesses` は一覧全体を見て最も深い
   プロジェクト 1 つを選ぶので、一覧が伸びれば数が動く。**先に全部を決めてから配れば、
   後から行が改名も併合も消滅もしない。** */

/** 作業ディレクトリだけが分かっている `transcript` 1 つ */
export interface LocatedSession {
  readonly file: string;
  /** `transcript` に書かれていた作業ディレクトリ。手を加えない */
  readonly cwd: string | null;
  /** 自分と子のうち最も新しい書き込み */
  readonly lastActivityMs: number;
}

/** slug 1 つぶんの、識別に要るところだけ */
export interface LocatedGroup<S extends LocatedSession> {
  readonly slug: string;
  readonly canonicalPath: string | null;
  readonly sessions: readonly S[];
  /* この slug のディレクトリを走査できたか。省くと、見えたセッションのぶんだけ走査できた
     ものとして扱う。

     セッションが空になる理由は 2 つある。本当に 1 つも無いのと、ディレクトリを読めなかった
     のである。**後者を前者に倒すと、プロジェクトが一覧から黙って消える。** */
  readonly walked?: Observation<number>;
}

/** 束ねて数え終えたプロジェクト。中身は呼ぶ側が知っている型のまま運ぶ */
export interface IndexedProject<S> extends MergedProject<S> {
  readonly name: string;
  /* このプロジェクトに帰属した、生きているプロセスの数。

     **添字ではなくここに持つ。** `attributeProcesses` が返すのは併合した順の配列なので、
     並べ替えた後の添字で引くと、別のプロジェクトの数を読むことになる。 */
  readonly liveProcessCount: number;
  /* 束ねた slug の `transcript` を数え上げられたか。数え上げられたなら、そこに見えた数。

     ディレクトリを走査できなかったときも、走査は通ったのに見えた `transcript` を全部は
     載せられなかったときも、数え上げられていない。**`sessions` が短い理由は、ここにしか
     書かれていない。** */
  readonly walked: Observation<number>;
}

const latestOf = (sessions: readonly LocatedSession[]): number =>
  sessions.reduce((latest, session) => Math.max(latest, session.lastActivityMs), 0);

/* 作業ディレクトリは、最も新しいセッションから順に見て最初に見つかったものを採る。

   どのセッションも同じプロジェクトを指しているはずだが、パスの書き表し方は時とともに
   変わり得るので、新しいものを信じる。並べる前に探すと結果が変わるので、ここで並べる。 */
export function deriveGroupPath(sessions: readonly LocatedSession[]): string | null {
  for (const session of sortByLastActivityDesc(sessions)) {
    if (session.cwd !== null && session.cwd !== '') return session.cwd;
  }
  return null;
}

/* この slug の `transcript` を数え上げられたか。数え上げられたなら、そこに見えた数。

   走査できたと言われていない slug は、見えたセッションのぶんだけ走査できたものとして扱う。

   **走査が通っても、見えた `transcript` を全部は載せられていないことがある。**
   ディレクトリを辿れて一覧は返ったが、1 本ずつを見に行くところで落ちた場合である。
   数が食い違うのに `observed` のまま通すと、載せられなかった `transcript` が
   「無かった」ものとして数に混ざる。 */
const walkedOf = (group: LocatedGroup<LocatedSession>): Observation<number> => {
  const walked = group.walked ?? observed(group.sessions.length);
  if (walked.kind !== 'observed' || walked.value <= group.sessions.length) return walked;
  return unobservable(
    new TranscriptWalkIncompleteError(
      `${group.slug}: saw ${walked.value} transcripts but could only read ${group.sessions.length}`,
      { details: { slug: group.slug, seen: walked.value, read: group.sessions.length } },
    ),
  );
};

/* 束ねた slug の走査結果を、1 つにまとめる。

   **1 つでも読めなかった slug があれば、束ねた先も読めなかったことにする。** 読めた slug の
   ぶんだけを数えると、数え落とした `transcript` が「無かった」ものとして数に混ざる。

   ディレクトリごと無くなっていた slug は 0 として足す。これは分からないのではなく、
   そこに `transcript` が無いと分かっている。 */
function combineWalks(parts: readonly Observation<number>[]): Observation<number> {
  let total = 0;
  for (const part of parts) {
    if (part.kind === 'unobservable') return part;
    if (part.kind === 'observed') total += part.value;
  }
  return observed(total);
}

/* slug を束ね、プロセスを配り、並べる。**索引も木もここを通る。**

   2 本に分けると、索引が言う行と木が言う行が食い違い得る。食い違ったときに壊れるのは
   「先に識別を決めてから配る」という前提そのもので、行が後から改名も併合もしないという
   保証が消える。 */
export function indexProjects<S extends LocatedSession>(input: {
  readonly groups: readonly LocatedGroup<S>[];
  readonly processes: readonly AgentProcess[];
}): readonly IndexedProject<S>[] {
  /* 走査結果は slug ごとに来るので、束ねた後に slug で引き直す。**併合そのものには
     持ち込まない。** 併合が見ているのはパスと slug の辞書順だけで、そこへ走査の成否を
     混ぜると、読めなかった slug が代表の選び方まで変えてしまう。

     行を残すかどうかも、ここで決めた 1 つの答えを見る。2 か所で数え直すと、行に残った
     プロジェクトの欄が「走査できた」と言い、消えたプロジェクトの理由がどこにも残らない。 */
  const walks = new Map(input.groups.map((group) => [group.slug, walkedOf(group)]));

  /* セッションを 1 つも持たない slug は、プロジェクトとして数えない。**数え上げられなかった
     ディレクトリだけは残す。** そこにセッションが在るかどうかを、こちらは知らないからである。
     落とすと、動いているセッションを抱えたプロジェクトが一覧から消え、ユーザーには
     初めから無かったのと同じに見える。 */
  const mergeable: MergeableProject<S>[] = input.groups
    .filter((group) => group.sessions.length > 0 || walks.get(group.slug)?.kind === 'unobservable')
    .map((group) => ({
      slug: group.slug,
      path: deriveGroupPath(group.sessions),
      canonicalPath: group.canonicalPath,
      latestActivityMs: latestOf(group.sessions),
      sessions: group.sessions,
    }));

  const merged = mergeProjects(mergeable);

  /* 帰属は解決済みのパスで測る。OS が教える作業ディレクトリは解決済みなので、
     生の表記と突き合わせると、書き表し方の揺れているところで取りこぼす。 */
  const counts = attributeProcesses(
    merged.map((project) => project.canonicalPath),
    input.processes,
  );

  return sortByLatestActivityDesc(
    merged.map((project, at) => ({
      ...project,
      name: project.path === null ? project.id : pathBasename(project.path),
      liveProcessCount: counts[at] ?? 0,
      walked: combineWalks(project.slugs.flatMap((slug) => walks.get(slug) ?? [])),
    })),
  );
}

/** 中身を読む前の一覧。行の識別だけが決まっている */
export function buildProjectIndex<S extends LocatedSession>(input: {
  readonly groups: readonly LocatedGroup<S>[];
  readonly processes: Observation<readonly AgentProcess[]>;
  /** `~/.claude/projects` を走査できたか */
  readonly sources: Observation<number>;
  readonly nowMs: number;
  readonly activeThresholdMs: number;
  /** この slug に属する `transcript` の数。セッションと子を合わせる */
  readonly transcriptsOf: (session: S) => number;
}): ProjectIndex {
  const indexed = indexProjects({
    groups: input.groups,
    processes: input.processes.kind === 'observed' ? input.processes.value : [],
  });

  const stubs: ProjectStub[] = indexed.map((project) => ({
    id: project.id,
    slugs: project.slugs,
    path: project.path,
    canonicalPath: project.canonicalPath,
    name: project.name,
    liveProcessCount: project.liveProcessCount,
    latestActivityMs: project.latestActivityMs,
    transcriptCount: project.sessions.reduce(
      (total, session) => total + input.transcriptsOf(session),
      0,
    ),
    walked: project.walked,
  }));

  return {
    generatedAtMs: input.nowMs,
    activeThresholdMs: input.activeThresholdMs,
    sources: input.sources,
    processes: mapObserved(input.processes, (found) => found.length),
    stubs,
  };
}
