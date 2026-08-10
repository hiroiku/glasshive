import { err, type Result } from '~/app-kernel/result.ts';
import type { TranscriptIndexService } from '~/application/services/sessions/transcript-index.service.ts';
import {
  fromIndex,
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

/* `git` を読むコントローラー。

   **パスは受け取らない。** プロジェクトを名指せるのは自分の一覧に出た id だけで、
   パスはこちらが引く。ここで任意の絶対パスを受けると、ブランチ名も題も差分も、
   尋ねられれば誰にでも渡すことになる。

   `rev` の文字列は内側で形を検証する。ここでは検証しない — 二か所で検証すると、
   片方だけが緩んだときに気付けない。 */

export type GitOverviewResponse = ApiResponse<GitOverviewJson>;
export type GitRefResponse = ApiResponse<GitRefLogJson>;

export interface GitDeps {
  readonly overview: ObserveRepositoryUseCase;
  readonly ref: ObserveRefUseCase;
  readonly index: TranscriptIndexService;
}

/* 名指されたプロジェクトの、解決済みのパス。引けない id は、形が違うのも一覧に無いのも同じ断り方。

   **木ではなく索引を引く。** 要るのは「この id はどこに在るか」だけで、それは中身を読む前に
   決まっている。木を組んでから引くと、`git` を 1 本走らせるために `~/.claude/projects` を
   全部読むことになる。 */
async function locate(index: TranscriptIndexService, input: unknown): Promise<Result<string>> {
  const projectId = projectIdOf(input);
  if (!projectId.ok) return err(projectId.error);
  const snapshot = await index.get();
  if (!snapshot.ok) return err(snapshot.error);
  return resolveProject(
    fromIndex(snapshot.value.index, snapshot.value.transcriptFiles),
    projectId.value,
  );
}

export async function readGitOverview(deps: GitDeps, input: unknown): Promise<GitOverviewResponse> {
  const path = await locate(deps.index, input);
  if (!path.ok) return { ok: false, ...presentError(path.error) };
  return presentGitOverview(await deps.overview.execute(path.value));
}

export async function readGitRef(deps: GitDeps, input: unknown): Promise<GitRefResponse> {
  const path = await locate(deps.index, input);
  if (!path.ok) return { ok: false, ...presentError(path.error) };

  const rev = own(input, 'rev');
  if (typeof rev !== 'string' || rev === '') {
    return {
      ok: false,
      ...presentError(new InvalidSessionsRequestError('No revision to observe')),
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
