import { type Observation, observed } from '~/app-kernel/observation.ts';
import { err, ok, type Result } from '~/app-kernel/result.ts';
import { ProjectNotObservedError } from '~/application/errors/sessions/not-observed.error.ts';
import type { TranscriptSearchService } from '~/application/services/sessions/transcript-search.service.ts';
import type { TreeSnapshotService } from '~/application/services/sessions/tree-snapshot.service.ts';
import {
  SEARCH_MAX_FILES,
  SEARCH_MIN_QUERY_CHARS,
  STATS_WINDOW_MS,
} from '~/domain/value-objects/sessions/observation-window.value-object.ts';

/* プロジェクト 1 つの `transcript` を横断して語を探す。

   返すのは当たった `transcript` のパスだけである。どこに当たったかまでは返さない —
   この検索の目的は「どのエージェントの話か」を絞ることで、抜き書きを読むことではない。

   短すぎる語では探さない。全部に当たって絞り込みにならないうえ、
   何百の `transcript` を末尾まで開くことになる。 */

export interface SearchRequest {
  readonly projectId: string;
  readonly query: string;
}

export interface ObserveSearchUseCase {
  execute(request: SearchRequest, nowMs: number): Promise<Result<Observation<readonly string[]>>>;
}

export function createSearchTranscripts(deps: {
  readonly tree: TreeSnapshotService;
  readonly search: TranscriptSearchService;
}): ObserveSearchUseCase {
  const { tree, search } = deps;

  return {
    async execute({ projectId, query }, nowMs) {
      const trimmed = query.trim();
      // 短すぎる語は断らない。探した結果として何も当たらなかったことにする
      if (trimmed.length < SEARCH_MIN_QUERY_CHARS) return ok(observed([]));

      const snapshot = await tree.get();
      if (!snapshot.ok) return snapshot;

      const project = snapshot.value.projects.find((candidate) => candidate.id === projectId);
      if (project === undefined) {
        return err(new ProjectNotObservedError('Not an observed project'));
      }

      const files: string[] = [];
      for (const session of project.sessions) {
        files.push(session.file);
        for (const subagent of session.subagents) files.push(subagent.file);
      }

      // 正規化するのはここで一度だけ。`transcript` ごとに正規化し直す理由が無い
      return ok(
        await search.findTails(files, trimmed.toLowerCase(), {
          sinceMs: nowMs - STATS_WINDOW_MS,
          limit: SEARCH_MAX_FILES,
        }),
      );
    },
  };
}
