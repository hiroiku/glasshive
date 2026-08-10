import { mapObserved } from '~/app-kernel/observation.ts';
import { ok, type Result } from '~/app-kernel/result.ts';
import type { AgentProcessIntegration } from '~/application/ports/integrations/sessions/agent-process.integration.ts';
import type {
  TranscriptGroup,
  TranscriptRepository,
} from '~/application/ports/repositories/sessions/transcript.repository.ts';
import {
  createTranscriptDrafts,
  type TranscriptDraftService,
} from '~/application/services/sessions/transcript-draft.service.ts';
import type { ProjectTree } from '~/domain/entities/sessions/observed-project.entity.ts';
import {
  buildProjectTree,
  type DraftProject,
  type DraftSession,
  deriveProjectPath,
} from '~/domain/services/sessions/project-tree.service.ts';

/* 木をスナップショット 1 つぶん観測する。

   走査は 2 周に分ける。1 周目は名前と stat だけで中身を読まない。2 周目で `transcript` を
   パースする。1 周目が軽いので、どの `transcript` をどこまで読むかを、読む前に決められる。

   **どれか 1 つが読めなくても、木は返す。** 読めなかった事実はその欄に残す。
   欠けたところだけが黙り、残りは今までどおり見える、というのが観測ツールのあるべき姿である。 */

/* ここに並ぶ名前が、この use-case の出力である。**外はこれだけを見る。**
   内側の形が変わっても、外へ出す経路はここを通るので、写す側は巻き込まれない。 */
export type {
  ObservedProject,
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

export interface ObserveTreeUseCase {
  execute(nowMs: number): Promise<Result<ProjectTree>>;
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

export function createObserveTree(deps: {
  readonly transcripts: TranscriptRepository;
  readonly processes: AgentProcessIntegration;
  readonly activeThresholdMs: number;
  /* パース結果のキャッシュを外から渡せるようにしてある。統計は木と同じ素材を見るので、
     同じものを渡せば 8MiB を二度読まずに済む。渡されなければ自分で作る。 */
  readonly drafts?: TranscriptDraftService;
}): ObserveTreeUseCase {
  const { transcripts, processes, activeThresholdMs } = deps;
  const drafts: TranscriptDraftService =
    deps.drafts ?? createTranscriptDrafts({ transcripts, activeThresholdMs });

  async function readGroup(group: TranscriptGroup, nowMs: number): Promise<DraftProject> {
    /* `transcript` は 1 つずつ読む。**一度に始めると、読み取ったテキストが全部いっぺんに居座る。**
       `~/.claude/projects` を読むのに待ち時間は無いので、まとめて始めても速くはならない。
       速くならないかわりに、`transcript` の数だけテキストが積み上がってメモリを食い尽くす。 */
    const sessions: DraftSession[] = [];
    for (const source of group.sessions) sessions.push(await drafts.readSession(source, nowMs));
    /* パスの書き表し方の揺れは、ここで正規化しておく。正規化せずに木へ渡すと、
       同じ実体のプロジェクトが別名のまま二つに並び、プロセスの帰属も割れる。

       **正規化できなかったことは null のまま渡す。** 渡された文字列で代えるのは木を組む側の
       決め事で(`MergeableProject.canonicalPath`)、ここでも代えると同じ判断が
       二か所に散る。散ったほうは誰にも見えないので、片方だけ変わっても気付けない。 */
    const path = deriveProjectPath(sessions);
    const canonical = path === null ? null : await transcripts.canonicalize(path);
    return {
      slug: group.slug,
      canonicalPath: canonical !== null && canonical.kind === 'observed' ? canonical.value : null,
      sessions,
    };
  }

  return {
    async execute(nowMs) {
      const [groups, live] = await Promise.all([transcripts.listTranscripts(), processes.list()]);
      const found: readonly TranscriptGroup[] = groups.kind === 'observed' ? groups.value : [];
      /* 走査できた周だけキャッシュを掃除する。走査できなかった周に落とすと、
         `~/.claude/projects` が一瞬読めなかっただけでキャッシュが全部消え、
         次の周に全部を読み直すことになる。 */
      if (groups.kind === 'observed') drafts.keepOnly(liveFilesOf(found));
      const projects: DraftProject[] = [];
      for (const group of found) projects.push(await readGroup(group, nowMs));
      /* 断る理由が無い。観測できなかったことは木の中の `Observation` に残るので、
         呼び出しそのものは必ず受理される。 */
      return ok(
        buildProjectTree({
          drafts: projects,
          processes: live,
          sources: mapObserved(groups, (walked) => walked.length),
          nowMs,
          activeThresholdMs,
        }),
      );
    },
  };
}
