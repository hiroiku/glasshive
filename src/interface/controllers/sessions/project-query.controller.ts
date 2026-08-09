import { err, ok, type Result } from '~/app-kernel/result.ts';
import { InvalidSessionsRequestError } from '~/interface/errors/sessions/request.error.ts';

/* 「巣ひとつを名指す問い」の読み方。消費も探しも、名指し方は同じである。

   **名指せるのは自分の一覧に出た id だけで、場所は受け取らない。**
   場所を渡り歩くという攻め口そのものが、口の形の時点で消えている。 */

/** 記録が自分で持っている欄だけを読む。土台から生えた欄は求めの欄ではない */
export const own = (input: unknown, key: string): unknown => {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) return undefined;
  const record = input as Record<string, unknown>;
  return Object.hasOwn(record, key) ? record[key] : undefined;
};

export function projectIdOf(input: unknown): Result<string, InvalidSessionsRequestError> {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) {
    return err(new InvalidSessionsRequestError('Request is not readable as a project query'));
  }
  const projectId = own(input, 'projectId');
  if (typeof projectId !== 'string' || projectId === '') {
    return err(new InvalidSessionsRequestError('No project to query'));
  }
  return ok(projectId);
}
