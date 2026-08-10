import type { Clock } from '~/app-kernel/clock.ts';
import type { ObserveSearchUseCase } from '~/application/use-cases/sessions/search-transcripts.use-case.ts';
import { own, projectIdOf } from '~/interface/controllers/sessions/project-query.controller.ts';
import { InvalidSessionsRequestError } from '~/interface/errors/sessions/request.error.ts';
import { type ApiResponse, presentError } from '~/interface/presenters/api-error.presenter.ts';
import {
  presentSearch,
  type SearchJson,
} from '~/interface/presenters/sessions/search.presenter.ts';

/* `transcript` を横断して語を探すコントローラー。

   短すぎる語を断らないのは、打ち込んでいる途中の 1 文字が毎回赤く咎められないためである。
   探した結果として何も当たらなかったことにする — 実際、絞り込みにならない語である。

   読み始める位置は数として読めるかだけを見る。どこまでが正しい位置かは内側が決める。 */

export type SearchResponse = ApiResponse<SearchJson>;

/** 読み始める位置。無いのと、負の数と、数として読めない値は、どれも最初からの意味にする */
function offsetOf(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) return 0;
  return Math.floor(value);
}

export async function searchTranscripts(
  deps: { readonly useCase: ObserveSearchUseCase; readonly clock: Clock },
  input: unknown,
): Promise<SearchResponse> {
  const projectId = projectIdOf(input);
  if (!projectId.ok) return { ok: false, ...presentError(projectId.error) };

  const query = own(input, 'query');
  if (typeof query !== 'string') {
    return {
      ok: false,
      ...presentError(new InvalidSessionsRequestError('Search term is not readable as text')),
    };
  }

  const found = await deps.useCase.execute(
    { projectId: projectId.value, query, offset: offsetOf(own(input, 'offset')) },
    deps.clock.now(),
  );
  if (!found.ok) return { ok: false, ...presentError(found.error) };
  return { ok: true, body: presentSearch(found.value) };
}
