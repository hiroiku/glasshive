import type { Clock } from '~/app-kernel/clock.ts';
import type { ObserveUsageUseCase } from '~/application/use-cases/sessions/observe-usage.use-case.ts';
import { projectIdOf } from '~/interface/controllers/sessions/project-query.controller.ts';
import { type ApiResponse, presentError } from '~/interface/presenters/api-error.presenter.ts';
import { presentUsage, type UsageJson } from '~/interface/presenters/sessions/usage.presenter.ts';

/* 消費のバケットを返すコントローラー。集計したものだけを渡し、グラフの形にするのは画面の側の仕事である。 */

export type UsageResponse = ApiResponse<UsageJson>;

export async function readUsage(
  deps: { readonly useCase: ObserveUsageUseCase; readonly clock: Clock },
  input: unknown,
): Promise<UsageResponse> {
  const projectId = projectIdOf(input);
  if (!projectId.ok) return { ok: false, ...presentError(projectId.error) };

  /* 今の時刻は 1 回だけ引く。対象期間の始まりとバケットの絞り込みで別々に引くと、
     境目のバケットが入ったり入らなかったりする。 */
  const usage = await deps.useCase.execute(projectId.value, deps.clock.now());
  if (!usage.ok) return { ok: false, ...presentError(usage.error) };
  return { ok: true, body: presentUsage(usage.value) };
}
