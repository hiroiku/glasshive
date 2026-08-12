import { err, ok, type Result } from '~/app-kernel/result.ts';
import type { TranscriptIndexService } from '~/application/services/sessions/transcript-index.service.ts';
import {
  fromIndex,
  resolveProject,
} from '~/application/services/workspace/readable-scope.service.ts';
import type { GetGithubIssueBodyUseCase } from '~/application/use-cases/issues/get-github-issue-body.use-case.ts';
import type { GetGithubIssueDiscussionUseCase } from '~/application/use-cases/issues/get-github-issue-discussion.use-case.ts';
import type { ListGithubIssueEventsUseCase } from '~/application/use-cases/issues/list-github-issue-events.use-case.ts';
import type { ListGithubIssuesUseCase } from '~/application/use-cases/issues/list-github-issues.use-case.ts';
import { own, projectIdOf } from '~/interface/controllers/sessions/project-query.controller.ts';
import { InvalidSessionsRequestError } from '~/interface/errors/sessions/request.error.ts';
import { type ApiResponse, presentError } from '~/interface/presenters/api-error.presenter.ts';
import {
  type GithubIssueBodyJson,
  type GithubIssueDiscussionChunkJson,
  type GithubIssueEventsChunkJson,
  type IssuesChunkJson,
  presentGithubIssueBody,
  presentGithubIssueDiscussionHead,
  presentGithubIssueDiscussionPage,
  presentGithubIssueEventsHead,
  presentGithubIssueEventsPage,
  presentIssuePage,
  presentIssuesHead,
} from '~/interface/presenters/issues/issues.presenter.ts';

/* 課題を読むコントローラー。

   **パスは受け取らない。** プロジェクトを名指せるのは自分の一覧に出た id だけで、
   パスはこちらが自分の観測から引く。ここで任意の絶対パスを受けると、画像を 1 枚
   読み込ませるだけで、ローカルのどこを尋ねるかを外から決められることになる。 */

export type GithubIssueBodyResponse = ApiResponse<GithubIssueBodyJson>;

export interface GithubIssuesDeps {
  readonly list: ListGithubIssuesUseCase;
  readonly body: GetGithubIssueBodyUseCase;
  /** 開いた 1 件のやり取り。本文とは別の呼び出しで、開いたときにだけ尋ねる */
  readonly discussion: GetGithubIssueDiscussionUseCase;
  /** 一覧に出ている課題に起きたこと。一覧とは別の呼び出しで、右の時間軸に点を置くためだけに使う */
  readonly events: ListGithubIssueEventsUseCase;
  readonly index: TranscriptIndexService;
}

/* 名指されたプロジェクトの、解決済みのパス。引けない id は、形が違うのも一覧に無いのも同じ断り方。

   **木ではなく索引を引く。** 要るのは「この id はどこに在るか」だけで、それは中身を読む前に
   決まっている。木を組んでから引くと、課題を一覧するたびに `~/.claude/projects` を
   全部読むことになり、`gh` を呼ぶ前の段階で画面が待たされる。 */
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

/* 尋ねられた課題の番号。**受け取った値をそのまま使わない。**

   一覧に出る番号は必ず正の整数である。小数も 0 も負も、`Number.MAX_SAFE_INTEGER` を超えた値も
   一覧には現れないので、`gh` を起こす前にここで断る。 */
function issueNumberOf(input: unknown): Result<number> {
  const number = own(input, 'number');
  if (typeof number !== 'number' || !Number.isSafeInteger(number) || number <= 0) {
    return err(new InvalidSessionsRequestError('No issue number to fetch'));
  }
  return ok(number);
}

/* GitHub の課題を、読めたページから順に返す。

   **断りは最初のチャンクより前にしか投げられない。** 1 つでも配った後は HTTP のステータスが
   既に決まっているので、そこで投げてもエラーコードから引いた status にはならない。
   プロジェクトを名指せなかったときの断りは、最初の `yield` の前に出る。

   ページが読めなかったことは断りではない。それは観測の結果なので、最初の 1 枚が `state` として
   運ぶ —— 断って 503 にすると、`gh` が答えなかったことと、こちらが受理しなかったことが
   同じ形になる。 */
export async function* streamGithubIssues(
  deps: GithubIssuesDeps,
  input: unknown,
): AsyncGenerator<IssuesChunkJson, void, void> {
  const path = await locate(deps.index, input);
  if (!path.ok) throw path.error;

  // 載せるかどうかだけの指定なので、読めない値は「載せない」に倒してよい
  const includeClosed = own(input, 'includeClosed') === true;

  for await (const chunk of deps.list.stream({ projectPath: path.value, includeClosed })) {
    if (chunk.kind === 'head') yield { kind: 'head', head: presentIssuesHead(chunk.head) };
    else if (chunk.kind === 'page') yield { kind: 'page', ...presentIssuePage(chunk.ledger) };
    else yield { kind: 'complete', truncated: chunk.truncated };
  }
}

/* GitHub の課題 1 件の本文。**番号は一覧に出ていたものを渡す。**

   一覧と同じ id でプロジェクトを名指し、尋ね先はこちらが remote から引く。番号だけを
   受け取っても、それが指す先はこちらが決めたリポジトリの中にしかない。 */
export async function getGithubIssueBody(
  deps: GithubIssuesDeps,
  input: unknown,
): Promise<GithubIssueBodyResponse> {
  const path = await locate(deps.index, input);
  if (!path.ok) return { ok: false, ...presentError(path.error) };

  const number = issueNumberOf(input);
  if (!number.ok) return { ok: false, ...presentError(number.error) };

  const body = await deps.body.execute({ projectPath: path.value, number: number.value });
  if (!body.ok) return { ok: false, ...presentError(body.error) };
  return { ok: true, body: presentGithubIssueBody(body.value) };
}

/* GitHub の課題 1 件のやり取りを、読めたページから順に返す。

   **断りは最初のチャンクより前にしか投げられない。** プロジェクトを名指せなかったことと、
   番号が課題の番号の形をしていないことは、どちらも最初の `yield` の前に出る。

   ページが読めなかったことは断りではない。それは観測の結果なので、最初の 1 枚が `state` として
   運ぶ —— 断って 503 にすると、`gh` が答えなかったことと、こちらが受理しなかったことが
   同じ形になる。 */
export async function* streamGithubIssueDiscussion(
  deps: GithubIssuesDeps,
  input: unknown,
): AsyncGenerator<GithubIssueDiscussionChunkJson, void, void> {
  const path = await locate(deps.index, input);
  if (!path.ok) throw path.error;

  const number = issueNumberOf(input);
  if (!number.ok) throw number.error;

  const walk = deps.discussion.stream({ projectPath: path.value, number: number.value });
  for await (const chunk of walk) {
    if (chunk.kind === 'head')
      yield { kind: 'head', head: presentGithubIssueDiscussionHead(chunk.head) };
    else if (chunk.kind === 'page') {
      yield { kind: 'page', entries: presentGithubIssueDiscussionPage(chunk.entries) };
    } else yield { kind: 'complete', truncated: chunk.truncated };
  }
}

/* 一覧に出ている課題に起きたことを、読めたページから順に返す。

   **ページが読めなかったことは断りではない。** 断って 503 にすると、`gh` が答えなかったことと、
   こちらが受理しなかったことが同じ形になる。断れるのは最初のチャンクより前だけである。 */
export async function* streamGithubIssueEvents(
  deps: GithubIssuesDeps,
  input: unknown,
): AsyncGenerator<GithubIssueEventsChunkJson, void, void> {
  const path = await locate(deps.index, input);
  if (!path.ok) throw path.error;

  for await (const chunk of deps.events.stream({ projectPath: path.value })) {
    if (chunk.kind === 'head')
      yield { kind: 'head', head: presentGithubIssueEventsHead(chunk.head) };
    else if (chunk.kind === 'page') {
      yield { kind: 'page', issues: presentGithubIssueEventsPage(chunk.issues) };
    } else yield { kind: 'complete', complete: chunk.complete };
  }
}
