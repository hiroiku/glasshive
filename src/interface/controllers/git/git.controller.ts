import { err, type Result } from '~/app-kernel/result.ts';
import type { TreeSnapshotService } from '~/application/services/sessions/tree-snapshot.service.ts';
import {
  fromTree,
  resolveProject,
} from '~/application/services/workspace/readable-scope.service.ts';
import type { ObserveRefUseCase } from '~/application/use-cases/git/observe-ref.use-case.ts';
import type { ObserveRepositoryUseCase } from '~/application/use-cases/git/observe-repository.use-case.ts';
import { own, projectIdOf } from '~/interface/controllers/sessions/project-query.controller.ts';
import { InvalidSessionsRequestError } from '~/interface/errors/sessions/request.error.ts';
import { type ApiResponse, presentError } from '~/interface/presenters/api-error.presenter.ts';
import {
  type GitOverviewJson,
  type GitRefLogJson,
  presentGitOverview,
  presentRefDetail,
} from '~/interface/presenters/git/git.presenter.ts';

/* 記録を読む窓。

   **場所は受け取らない。** 巣を名指せるのは自分の一覧に出た id だけで、場所はこちらが引く。
   旧実装はここで任意の絶対パスを受けており、枝の名も題も差分も、尋ねられれば誰にでも渡した。

   指しの字は内側で形を確かめる。**ここでは確かめない** — 二か所で確かめると、
   片方だけが緩んだときに気付けない。 */

export type GitOverviewResponse = ApiResponse<GitOverviewJson>;
export type GitRefResponse = ApiResponse<GitRefLogJson>;

export interface GitDeps {
  readonly overview: ObserveRepositoryUseCase;
  readonly ref: ObserveRefUseCase;
  readonly tree: TreeSnapshotService;
}

/** 名指された巣の、解決済みの場所。引けない id は、形が違うのも一覧に無いのも同じ断り方 */
async function locate(tree: TreeSnapshotService, input: unknown): Promise<Result<string>> {
  const projectId = projectIdOf(input);
  if (!projectId.ok) return err(projectId.error);
  const snapshot = await tree.get();
  if (!snapshot.ok) return err(snapshot.error);
  return resolveProject(fromTree(snapshot.value), projectId.value);
}

export async function readGitOverview(deps: GitDeps, input: unknown): Promise<GitOverviewResponse> {
  const path = await locate(deps.tree, input);
  if (!path.ok) return { ok: false, ...presentError(path.error) };
  return presentGitOverview(await deps.overview.execute(path.value));
}

export async function readGitRef(deps: GitDeps, input: unknown): Promise<GitRefResponse> {
  const path = await locate(deps.tree, input);
  if (!path.ok) return { ok: false, ...presentError(path.error) };

  const rev = own(input, 'rev');
  if (typeof rev !== 'string' || rev === '') {
    return {
      ok: false,
      ...presentError(new InvalidSessionsRequestError('どの指しを観るのかが無い')),
    };
  }
  const base = own(input, 'base');

  return presentRefDetail(
    await deps.ref.execute({
      projectPath: path.value,
      rev,
      base: typeof base === 'string' && base !== '' ? base : null,
    }),
  );
}
