import { type Observation, observed } from '~/app-kernel/observation.ts';
import { err, ok, type Result } from '~/app-kernel/result.ts';
import { ProjectNotObservedError } from '~/application/errors/sessions/not-observed.error.ts';
import type {
  TranscriptSearchPage,
  TranscriptSearchService,
} from '~/application/services/sessions/transcript-search.service.ts';
import type { TreeSnapshotService } from '~/application/services/sessions/tree-snapshot.service.ts';
import {
  SEARCH_MAX_FILES,
  SEARCH_MIN_QUERY_CHARS,
  SEARCH_SCAN_FILES,
  STATS_WINDOW_MS,
} from '~/domain/value-objects/sessions/observation-window.value-object.ts';

/* プロジェクト 1 つの `transcript` を横断して語を探す。

   返すのは当たった `transcript` のパスだけである。どこに当たったかまでは返さない —
   この検索の目的は「どのエージェントの話か」を絞ることで、抜き書きを読むことではない。

   1 回の呼び出しで読むのは候補の一部だけで、どこまで読んだかを併せて返す。呼ぶ側は
   `scanned` から次を頼み、当たりを足していく。**途中の結果を全部だと思わせない**ために、
   総数と読んだ本数も返す。

   短すぎる語では探さない。全部に当たって絞り込みにならないうえ、
   何百の `transcript` を末尾まで開くことになる。 */

export type { TranscriptSearchPage } from '~/application/services/sessions/transcript-search.service.ts';

export interface SearchRequest {
  readonly projectId: string;
  readonly query: string;
  /** 候補の何本目から読み始めるか。前の回が返した `scanned` を渡す */
  readonly offset: number;
}

export interface ObserveSearchUseCase {
  execute(
    request: SearchRequest,
    nowMs: number,
  ): Promise<Result<Observation<TranscriptSearchPage>>>;
}

/** 探さなかった回。候補が無いのではなく、探していない */
const NOTHING: TranscriptSearchPage = { files: [], scanned: 0, total: 0, done: true };

export function createSearchTranscripts(deps: {
  readonly tree: TreeSnapshotService;
  readonly search: TranscriptSearchService;
}): ObserveSearchUseCase {
  const { tree, search } = deps;

  return {
    async execute({ projectId, query, offset }, nowMs) {
      const trimmed = query.trim();
      // 短すぎる語は断らない。探した結果として何も当たらなかったことにする
      if (trimmed.length < SEARCH_MIN_QUERY_CHARS) return ok(observed(NOTHING));

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
          offset: Number.isFinite(offset) && offset > 0 ? Math.floor(offset) : 0,
          scan: SEARCH_SCAN_FILES,
          limit: SEARCH_MAX_FILES,
        }),
      );
    },
  };
}
