import { containsPath } from '~/app-kernel/path.ts';
import { ok, type Result } from '~/app-kernel/result.ts';
import type { TranscriptGroup } from '~/application/ports/repositories/sessions/transcript.repository.ts';
import type { TranscriptDraftService } from '~/application/services/sessions/transcript-draft.service.ts';
import type { TranscriptIndexService } from '~/application/services/sessions/transcript-index.service.ts';
import type {
  ObservedProject,
  ProjectIndex,
  ProjectStub,
  ProjectTree,
} from '~/domain/entities/sessions/observed-project.entity.ts';
import type { IndexedProject } from '~/domain/services/sessions/project-index.service.ts';
import {
  buildObservedProject,
  type DraftSession,
} from '~/domain/services/sessions/project-tree.service.ts';

/* 木をスナップショット 1 つぶん観測する。

   走査は 2 周に分ける。1 周目は名前と stat だけで中身を読まない。2 周目で `transcript` を
   パースする。1 周目が軽いので、どの `transcript` をどこまで読むかを、読む前に決められる。

   **どれか 1 つが読めなくても、木は返す。** 読めなかった事実はその欄に残す。
   欠けたところだけが黙り、残りは今までどおり見える、というのが観測ツールのあるべき姿である。

   配り方は 2 通りある。`execute` は最後まで読んでから 1 枚を返し、`observe` は読めた
   プロジェクトから順に配る。**導出は 1 本しかない** — `execute` は `observe` を最後まで
   汲んだものである。2 本持つと、逐次で見た木と最後に届く木が食い違い得る。 */

/* ここに並ぶ名前が、この use-case の出力である。**外はこれだけを見る。**
   内側の形が変わっても、外へ出す経路はここを通るので、写す側は巻き込まれない。 */
export type {
  ObservedProject,
  ProjectIndex,
  ProjectStub,
  ProjectTree,
} from '~/domain/entities/sessions/observed-project.entity.ts';
export type { TranscriptSession } from '~/domain/entities/sessions/session.entity.ts';
export type { SubagentSession } from '~/domain/entities/sessions/subagent.entity.ts';
export type { ActivityIntervalSet } from '~/domain/value-objects/sessions/activity-interval.value-object.ts';
export type {
  AwaitingKind,
  SessionState,
  SubagentState,
} from '~/domain/value-objects/sessions/session-state.value-object.ts';

/* ストリームに流れる 1 つ。**索引が必ず先に来る。**

   索引には行の識別が全部入っている。先に配ることで、後から届くプロジェクトは既に在る行を
   埋めるだけになり、行が増えも減りも改名もしない。 */
export type TreeDelta =
  | { readonly kind: 'index'; readonly index: ProjectIndex }
  | {
      readonly kind: 'project';
      readonly project: ObservedProject;
      /** ここまでに読み終えた `transcript` の数 */
      readonly readTranscripts: number;
      /** 索引が数えた `transcript` の総数 */
      readonly totalTranscripts: number;
    };

export interface ObserveTreeUseCase {
  execute(nowMs: number): Promise<Result<ProjectTree>>;
  /* 読めたプロジェクトから順に配る。最後に木を 1 枚返す。

     **配る単位はプロジェクト 1 つまるごとである。** セッションの状態も子の系統も
     プロジェクトの中で閉じているので、途中で描いた木はどれも真になる。
     セッション単位まで刻むと、まだ読んでいない兄弟が居る状態で待機を配ることになり、
     動いているセッションが「終わった」ものとして並ぶ。 */
  observe(nowMs: number): AsyncGenerator<TreeDelta, Result<ProjectTree>, void>;
}

/** いま `~/.claude/projects` に在る `transcript` すべて。子も含める — キャッシュは 1 本ごとに持っている */
function liveFilesOf(groups: readonly TranscriptGroup[]): ReadonlySet<string> {
  const live = new Set<string>();
  for (const group of groups) {
    for (const session of group.sessions) {
      live.add(session.file);
      for (const subagent of session.subagents) live.add(subagent.file);
    }
  }
  return live;
}

/* 名指されたディレクトリのプロジェクトから先に読む。

   **並べ替えるのは読む順だけである。** 一覧の並びは索引が決めたままで、配るときは id で
   置き換えるので、読む順が画面の行の順に漏れることはない。動くのは、名指した相手が
   画面に揃うまでの待ち時間だけである。 */
export function readFirstOrder(
  stubs: readonly ProjectStub[],
  roots: readonly string[],
): readonly ProjectStub[] {
  if (roots.length === 0) return stubs;
  const inside = (stub: ProjectStub): boolean => {
    const path = stub.canonicalPath;
    return path !== null && roots.some((root) => containsPath(root, path));
  };
  const named = stubs.filter(inside);
  return named.length === 0 ? stubs : [...named, ...stubs.filter((stub) => !inside(stub))];
}

export function createObserveTree(deps: {
  readonly index: TranscriptIndexService;
  readonly drafts: TranscriptDraftService;
  readonly activeThresholdMs: number;
  /* 先に読むディレクトリ。起動のときに名指されたリポジトリの根と worktree である。

     **観測してよい範囲ではない。** 読むのは今までどおり全部で、順番だけが変わる。 */
  readonly readFirst?: () => Promise<readonly string[]>;
}): ObserveTreeUseCase {
  const { index, drafts, activeThresholdMs } = deps;

  async function* generate(nowMs: number): AsyncGenerator<TreeDelta, Result<ProjectTree>, void> {
    const snapshot = await index.get();
    if (!snapshot.ok) return snapshot;
    const { groups, watchedIds } = snapshot.value;
    /* 観ると決めたものだけを組む。**見つけただけのものは、ここには来ない。**
       索引には見つけた名前も並んでいる —— それは「記録しますか」と尋ねる相手であって、
       中身を読む相手ではない。 */
    const projectIndex = {
      ...snapshot.value.index,
      stubs: snapshot.value.index.stubs.filter((stub) => watchedIds.has(stub.id)),
    };

    /* 走査できた周だけキャッシュを掃除する。走査できなかった周に落とすと、
       `~/.claude/projects` が一瞬読めなかっただけでキャッシュが全部消え、
       次の周に全部を読み直すことになる。 */
    if (projectIndex.sources.kind === 'observed') drafts.keepOnly(liveFilesOf(groups));

    yield { kind: 'index', index: projectIndex };

    const bySlug = new Map(groups.map((group) => [group.slug, group]));
    const total = projectIndex.stubs.reduce((sum, stub) => sum + stub.transcriptCount, 0);
    const projects: ObservedProject[] = [];
    let read = 0;

    /* 読む順だけを、名指されたディレクトリから先にする。並べ替えは索引が済ませてあり、
       配るときは id で置き換えるので、後から届いた行が既に落ち着いた行を押しのけることは
       この順でも起きない。 */
    for (const stub of readFirstOrder(projectIndex.stubs, (await deps.readFirst?.()) ?? [])) {
      const sessions: DraftSession[] = [];
      /* `transcript` は 1 つずつ読む。**一度に始めると、読み取ったテキストが全部いっぺんに居座る。**
         `~/.claude/projects` を読むのに待ち時間は無いので、まとめて始めても速くはならない。
         速くならないかわりに、`transcript` の数だけテキストが積み上がってメモリを食い尽くす。 */
      for (const slug of stub.slugs) {
        const group = bySlug.get(slug);
        if (group === undefined) continue;
        for (const source of group.sessions) {
          /* 子を走査できたかは、走査した側にしか分からない。下書きは `transcript` の中身しか
             読まないので、ここで添える。**添えないと、子を呼ばなかったセッションと、子を
             数えられなかったセッションが同じ形で木に並ぶ。** */
          const draft = await drafts.readSession(source, nowMs);
          sessions.push({ ...draft, subagentsWalked: source.subagentsWalked });
        }
      }

      /* 束ねる作業は索引が済ませてある。ここで組み直さないのは、組み直せば同じ問いに
         二度答えることになり、答えが割れたときに行の識別が入れ替わるからである。 */
      const merged: IndexedProject<DraftSession> = {
        id: stub.id,
        slugs: stub.slugs,
        path: stub.path,
        canonicalPath: stub.canonicalPath,
        name: stub.name,
        liveProcessCount: stub.liveProcessCount,
        latestActivityMs: stub.latestActivityMs,
        walked: stub.walked,
        sessions,
      };
      const project = buildObservedProject(merged, nowMs, activeThresholdMs);
      projects.push(project);
      read += stub.transcriptCount;
      yield {
        kind: 'project',
        project,
        readTranscripts: read,
        totalTranscripts: total,
      };
    }

    /* 断る理由が無い。観測できなかったことは木の中の `Observation` に残るので、
       呼び出しそのものは必ず受理される。 */
    return ok({
      generatedAtMs: nowMs,
      activeThresholdMs,
      sources: projectIndex.sources,
      processes: projectIndex.processes,
      projects,
    });
  }

  return {
    observe: generate,

    /* 最後まで汲む。**別の導出を持たない** — 逐次で見た木と、最後に届く木が食い違わない
       ことを、実装の形で保証している。 */
    async execute(nowMs) {
      const stream = generate(nowMs);
      let step = await stream.next();
      while (!step.done) step = await stream.next();
      return step.value;
    },
  };
}
