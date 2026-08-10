import { err, ok, type Result } from '~/app-kernel/result.ts';
import type { ObserveMessagesUseCase } from '~/application/use-cases/sessions/observe-messages.use-case.ts';
import { InvalidSessionsRequestError } from '~/interface/errors/sessions/request.error.ts';
import { type ApiResponse, presentError } from '~/interface/presenters/api-error.presenter.ts';
import {
  type MessagesJson,
  presentMessages,
} from '~/interface/presenters/sessions/messages.presenter.ts';
import { own, projectIdOf } from './project-query.controller.ts';

/* メッセージのやり取りを返すコントローラー。

   **名指せるのは、自分の一覧に出たプロジェクトとその中のセッションだけである。**
   パスは受け取らない。パスを渡り歩くという攻撃面が、入力の形の時点で消えている。 */

export type MessagesResponse = ApiResponse<MessagesJson>;

function sessionIdOf(input: unknown): Result<string, InvalidSessionsRequestError> {
  const sessionId = own(input, 'sessionId');
  if (typeof sessionId !== 'string' || sessionId === '') {
    return err(new InvalidSessionsRequestError('No session to query'));
  }
  return ok(sessionId);
}

export async function readMessages(
  deps: { readonly useCase: ObserveMessagesUseCase },
  input: unknown,
): Promise<MessagesResponse> {
  const projectId = projectIdOf(input);
  if (!projectId.ok) return { ok: false, ...presentError(projectId.error) };
  const sessionId = sessionIdOf(input);
  if (!sessionId.ok) return { ok: false, ...presentError(sessionId.error) };

  const messages = await deps.useCase.execute(projectId.value, sessionId.value);
  if (!messages.ok) return { ok: false, ...presentError(messages.error) };
  return { ok: true, body: presentMessages(messages.value) };
}
