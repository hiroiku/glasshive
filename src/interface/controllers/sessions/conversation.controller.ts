import { err, ok, type Result } from '~/app-kernel/result.ts';
import type {
  ConversationRequest,
  ReadConversationUseCase,
} from '~/application/use-cases/sessions/read-conversation.use-case.ts';
import { own } from '~/interface/controllers/sessions/project-query.controller.ts';
import { InvalidSessionsRequestError } from '~/interface/errors/sessions/request.error.ts';
import { type ApiResponse, presentError } from '~/interface/presenters/api-error.presenter.ts';
import {
  type EventPageJson,
  presentConversation,
} from '~/interface/presenters/sessions/conversation.presenter.ts';

/* 会話 1 頁を返す窓。

   枠組みを知らない形にしてある。求めも答えも素の値で、`Request` も `Response` も出てこない。

   **届いた形を検めるのはここの仕事である。** 位置は数として読めるかだけを見て、
   どこまでが正しい位置かは内側が決める — 端の丸めを二か所でやると必ず食い違う。 */

export type ConversationResponse = ApiResponse<EventPageJson>;

/* 位置として読む。無いのと、負の数と、読めない字は同じ扱いにする。

   どれも「末尾から読め」という意味になる。旧実装が `-1` を末尾の合図に使っていたので、
   負の数をここで受けておかないと、古いしおりが黙って先頭から読み直される。 */
function positionOf(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) return null;
  return Math.floor(value);
}

function requestOf(input: unknown): Result<ConversationRequest, InvalidSessionsRequestError> {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) {
    return err(new InvalidSessionsRequestError('Request is not readable as a conversation query'));
  }
  const file = own(input, 'file');
  if (typeof file !== 'string' || file === '') {
    return err(new InvalidSessionsRequestError('No transcript to read'));
  }

  return ok({
    file,
    from: positionOf(own(input, 'from')),
    to: positionOf(own(input, 'to')),
  });
}

export async function readConversation(
  useCase: ReadConversationUseCase,
  input: unknown,
): Promise<ConversationResponse> {
  const request = requestOf(input);
  // 形が読めない求めは、観測にも正本にも触らずに断る
  if (!request.ok) return { ok: false, ...presentError(request.error) };

  const page = await useCase.execute(request.value);
  if (!page.ok) return { ok: false, ...presentError(page.error) };
  /* 読めなかったことは値のまま渡す。**空の頁で表さない。**
     空にすると、開けなかった正本が「何も喋っていない」ものとして並ぶ。 */
  return { ok: true, body: presentConversation(page.value) };
}
