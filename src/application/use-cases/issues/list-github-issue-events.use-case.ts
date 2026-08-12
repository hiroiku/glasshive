import type { Observation } from '~/app-kernel/observation.ts';
import { observed } from '~/app-kernel/observation.ts';
import { ok, type Result } from '~/app-kernel/result.ts';
import type { GitCommandIntegration } from '~/application/ports/integrations/git/git-command.integration.ts';
import type { IssueTrackerIntegration } from '~/application/ports/integrations/issues/issue-tracker.integration.ts';
import { locateGithubRepository } from '~/application/services/issues/github-repository.service.ts';
import type {
  GithubIssueEvent,
  GithubIssueEventLog,
  GithubIssueEvents,
} from '~/domain/entities/issues/github-issue-events.entity.ts';
import { parseIssueEventsPage } from '~/domain/services/issues/github-issue.service.ts';

/* 一覧に出ている課題に起きたことを、一覧とは別に読む。

   **一覧の問い合わせに混ぜない。** `cli/cli` の 100 件で測ると、一覧だけなら 3.8〜4.6 秒で
   済むものが、イベントを混ぜると 6.7〜9.9 秒になる。一覧の問い合わせは Work の画面が開くまでを
   決めているので、混ぜたぶんだけ全部が待たされる。別に尋ねれば、一覧は今までの速さで開き、
   右の時間軸は返ってきたときに埋まる。

   ここが読めなくても一覧は読める。だから失敗はこの観測の中に閉じ込める —— 呼ぶ側が
   `Observation` を受け取り、点の列だけを「観測できなかった」として描く。 */

/* イベントの形は、外へ出すときにもそのまま要る。
   `interface` は domain を直に見られないので、ここが受け渡しの場所になる。 */
export type { GithubIssueEvent, GithubIssueEventLog, GithubIssueEvents };

/* 1 ページで求める件数と、辿るページ数の上限。

   **`list-github-issues.use-case.ts` と同じ値でなければならない。** 同じ件数・同じ並びで
   尋ねるから、返る課題が一覧と同じものになる。片方だけ変えると、一覧に出ていない課題の
   イベントを運び、一覧に出ている課題の点が消える。 */
const PAGE_SIZE = 100;
const MAX_PAGES = 5;

export interface ListGithubIssueEventsInput {
  readonly projectPath: string;
}

/* 記録の届き方。**一覧と同じく、ページ 1 にページ 5 を待つ理由は無い。**

   最初に来るのは `head` 1 つで、そこに観測が成り立ったかどうかが入る。成り立っていなければ
   それが答えの全部である。`page` はページ 1 つぶんで、前のページを含まない。

   `complete` は最後にしか言えない。**読んでいる途中を `complete: false` で表さない** ——
   あちらは「読みに行って、そこまでしか辿れなかった」であって、まだ届いていないことではない。 */
export type GithubIssueEventsChunk =
  | { readonly kind: 'head'; readonly head: Observation<null> }
  | { readonly kind: 'page'; readonly issues: readonly GithubIssueEvents[] }
  | { readonly kind: 'complete'; readonly complete: boolean };

export interface ListGithubIssueEventsUseCase {
  execute(
    input: ListGithubIssueEventsInput,
  ): Promise<Result<Observation<GithubIssueEventLog>, never>>;
  /** 読めたページから順に配る。`execute` はこれを汲み尽くしたものである */
  stream(input: ListGithubIssueEventsInput): AsyncGenerator<GithubIssueEventsChunk, void, void>;
}

export function createListGithubIssueEvents(deps: {
  readonly git: GitCommandIntegration;
  readonly tracker: IssueTrackerIntegration;
}): ListGithubIssueEventsUseCase {
  async function* walk({
    projectPath,
  }: ListGithubIssueEventsInput): AsyncGenerator<GithubIssueEventsChunk, void, void> {
    const source = await locateGithubRepository(deps.git, projectPath);
    if (source.kind !== 'observed') {
      yield { kind: 'head', head: source };
      yield { kind: 'complete', complete: false };
      return;
    }
    const { repository } = source.value;

    let cursor: string | null = null;
    let complete = true;
    let opened = false;

    for (let page = 0; page < MAX_PAGES; page++) {
      const answer = await deps.tracker.fetchIssueEvents({
        owner: repository.owner,
        name: repository.name,
        cursor,
        pageSize: PAGE_SIZE,
      });
      /* 1 ページ目で躓いたなら、この観測は成り立っていない。2 ページ目より後なら、
         そこまでは観えている —— 観えたぶんを捨てず、全部は辿れなかったことだけを言う。 */
      if (answer.kind !== 'observed') {
        if (!opened) {
          yield { kind: 'head', head: answer };
          yield { kind: 'complete', complete: false };
          return;
        }
        complete = false;
        break;
      }

      /* 応答を歩けなかった。**読みに行けなかったのとは分ける** —— `gh` は答えているので、
         観測そのものは成り立っている。辿れなかったことだけを言う。 */
      const parsed = parseIssueEventsPage(answer.value);
      if (parsed === null) {
        if (!opened) {
          yield { kind: 'head', head: observed(null) };
          yield { kind: 'complete', complete: false };
          return;
        }
        complete = false;
        break;
      }

      if (!opened) {
        yield { kind: 'head', head: observed(null) };
        opened = true;
      }
      yield { kind: 'page', issues: parsed.issues };

      if (!parsed.hasNextPage || parsed.endCursor === null) break;
      cursor = parsed.endCursor;
      // 次の周回に入れないなら、その先は読んでいない
      if (page === MAX_PAGES - 1) complete = false;
    }

    yield { kind: 'complete', complete };
  }

  return {
    stream: walk,
    async execute(input) {
      let head: Observation<null> | null = null;
      const issues: GithubIssueEvents[] = [];
      let complete = false;

      for await (const chunk of walk(input)) {
        if (chunk.kind === 'head') head = chunk.head;
        else if (chunk.kind === 'complete') complete = chunk.complete;
        else issues.push(...chunk.issues);
      }

      if (head === null || head.kind !== 'observed')
        return ok(head ?? observed({ issues, complete }));
      return ok(observed({ issues, complete }));
    },
  };
}
