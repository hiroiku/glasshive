import { err, type Result } from '~/app-kernel/result.ts';
import type { TreeSnapshotService } from '~/application/services/sessions/tree-snapshot.service.ts';
import {
  fromTree,
  resolveProject,
} from '~/application/services/workspace/readable-scope.service.ts';
import type { GetIssueUseCase } from '~/application/use-cases/issues/get-issue.use-case.ts';
import type { ListIssuesUseCase } from '~/application/use-cases/issues/list-issues.use-case.ts';
import { own, projectIdOf } from '~/interface/controllers/sessions/project-query.controller.ts';
import { InvalidSessionsRequestError } from '~/interface/errors/sessions/request.error.ts';
import { type ApiResponse, presentError } from '~/interface/presenters/api-error.presenter.ts';
import {
  type IssueJson,
  type IssuesJson,
  presentIssue,
  presentIssues,
} from '~/interface/presenters/issues/issues.presenter.ts';

/* 課題の台帳を読むコントローラー。

   **パスは受け取らない。** プロジェクトを名指せるのは自分の一覧に出た id だけで、
   パスはこちらが自分の観測から引く。ここで任意の絶対パスを受けると、画像を 1 枚
   読み込ませるだけで、ローカルの課題が外へ流れることになる。 */

export type IssuesResponse = ApiResponse<IssuesJson>;
export type IssueResponse = ApiResponse<IssueJson>;

export interface IssuesDeps {
  readonly list: ListIssuesUseCase;
  readonly get: GetIssueUseCase;
  readonly tree: TreeSnapshotService;
}

/** 名指されたプロジェクトの、解決済みのパス。引けない id は、形が違うのも一覧に無いのも同じ断り方 */
async function locate(tree: TreeSnapshotService, input: unknown): Promise<Result<string>> {
  const projectId = projectIdOf(input);
  if (!projectId.ok) return err(projectId.error);
  const snapshot = await tree.get();
  if (!snapshot.ok) return err(snapshot.error);
  return resolveProject(fromTree(snapshot.value), projectId.value);
}

export async function listIssues(deps: IssuesDeps, input: unknown): Promise<IssuesResponse> {
  const path = await locate(deps.tree, input);
  if (!path.ok) return { ok: false, ...presentError(path.error) };

  // 載せるかどうかだけの指定なので、読めない値は「載せない」に倒してよい
  const includeClosed = own(input, 'includeClosed') === true;
  const ledger = await deps.list.execute({
    projectPath: path.value,
    includeClosed,
  });
  if (!ledger.ok) return { ok: false, ...presentError(ledger.error) };
  return { ok: true, body: presentIssues(ledger.value) };
}

export async function getIssue(deps: IssuesDeps, input: unknown): Promise<IssueResponse> {
  const path = await locate(deps.tree, input);
  if (!path.ok) return { ok: false, ...presentError(path.error) };

  const id = own(input, 'id');
  if (typeof id !== 'string' || id === '') {
    return {
      ok: false,
      ...presentError(new InvalidSessionsRequestError('No issue to fetch')),
    };
  }

  const record = await deps.get.execute({ projectPath: path.value, id });
  if (!record.ok) return { ok: false, ...presentError(record.error) };
  return { ok: true, body: presentIssue(record.value) };
}
