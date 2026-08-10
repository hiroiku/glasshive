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

/* 会話 1 ページを返すコントローラー。

   `frameworks` を知らない形にしてある。リクエストもレスポンスも素の値で、`Request` も
   `Response` も出てこない。

   **入力を検証するのはここの仕事である。** 位置は数として読めるかだけを見て、
   どこまでが正しい位置かは内側が決める — 端の丸めを二か所でやると必ず食い違う。 */

export type ConversationResponse = ApiResponse<EventPageJson>;

/* 位置として読む。無いのと、負の数と、数として読めない値は同じ扱いにする。

   どれも「末尾から読め」という意味になる。`-1` を「末尾から」のマーカーとして送ってくる
   クライアントがあるので、負の数をここで受けておかないと、古い位置が黙って
   先頭から読み直される。 */
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
  // 形が読めないリクエストは、観測にも `transcript` にも触らずに断る
  if (!request.ok) return { ok: false, ...presentError(request.error) };

  const page = await useCase.execute(request.value);
  if (!page.ok) return { ok: false, ...presentError(page.error) };
  /* 読めなかったことは値のまま渡す。**空のページで表さない。**
     空にすると、開けなかった `transcript` が「何も喋っていない」ものとして並ぶ。 */
  return { ok: true, body: presentConversation(page.value) };
}
