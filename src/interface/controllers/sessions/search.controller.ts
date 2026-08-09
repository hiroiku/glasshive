import type { Clock } from '~/app-kernel/clock.ts';
import type { ObserveSearchUseCase } from '~/application/use-cases/sessions/search-transcripts.use-case.ts';
import { own, projectIdOf } from '~/interface/controllers/sessions/project-query.controller.ts';
import { InvalidSessionsRequestError } from '~/interface/errors/sessions/request.error.ts';
import { type ApiResponse, presentError } from '~/interface/presenters/api-error.presenter.ts';
import {
  presentSearch,
  type SearchJson,
} from '~/interface/presenters/sessions/search.presenter.ts';

/* 正本を横断して語を探す窓。

   短すぎる語を断らないのは、打ち込んでいる途中の 1 字が毎回赤く咎められないためである。
   探した結果として何も当たらなかったことにする — 実際、絞り込みにならない語である。 */

export type SearchResponse = ApiResponse<SearchJson>;

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
      ...presentError(new InvalidSessionsRequestError('探す語が字として読めない')),
    };
  }

  const found = await deps.useCase.execute({ projectId: projectId.value, query }, deps.clock.now());
  if (!found.ok) return { ok: false, ...presentError(found.error) };
  return { ok: true, body: presentSearch(found.value) };
}
