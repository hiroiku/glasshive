import { absent, type Observation, observed } from '~/app-kernel/observation.ts';
import { ok, type Result } from '~/app-kernel/result.ts';
import type { GitCommandIntegration } from '~/application/ports/integrations/git/git-command.integration.ts';
import type { IssueTrackerIntegration } from '~/application/ports/integrations/issues/issue-tracker.integration.ts';
import type { AvatarCacheService } from '~/application/services/issues/avatar-cache.service.ts';
import { locateGithubRepository } from '~/application/services/issues/github-repository.service.ts';
import type { GithubActor, GithubLabel } from '~/domain/entities/issues/github-issue.entity.ts';
import type {
  GithubIssueDiscussion,
  GithubIssueDiscussionEntry,
  GithubIssueReference,
} from '~/domain/entities/issues/github-issue-discussion.entity.ts';
import { parseIssueDiscussion } from '~/domain/services/issues/github-issue.service.ts';

/* GitHub の課題 1 件のやり取りを引く。コメントと `timeline` のイベントを 1 つの並びで返す。

   本文と同じく、読む人が 1 件を開いたときにだけ尋ねる。尋ね先も同じ `locateGithubRepository`
   が決める。**別々に決めてはいけない** —— 一覧に出ていた課題を開いたら別のリポジトリを
   尋ねた、では番号の指す先が変わる。 */

/* やり取りの形は、外へ出すときにもそのまま要る。
   `interface` は domain を直に見られないので、ここが受け渡しの場所になる。 */
export type {
  GithubIssueDiscussion,
  GithubIssueDiscussionEntry,
  GithubIssueReference,
  GithubLabel,
};

/* 課題 1 件のやり取りは、コメントもイベントも合わせて 1 ページ 100 件で返る。

   上限を置くのは、何百も続いた課題を開くたびに何十回も問い合わせが走るのを避けるため
   である。**当たったことは `truncated` で持ち回る** — 黙って切ると、上限より後ろの発言が
   「無かった」ことになる。 */
const MAX_PAGES = 5;

export interface GetGithubIssueDiscussionInput {
  readonly projectPath: string;
  /** 課題の番号。一覧に出ていたものを渡す */
  readonly number: number;
}

/* やり取りの届き方。一覧と同じく、ページ 1 の 100 件にページ 5 を待つ理由は無い。

   最初に来るのは `head` 1 つで、そこに観測が成り立ったかどうかが入る。成り立っていなければ
   それが答えの全部で、`page` は 1 つも来ない。`page` はページ 1 つぶんの並びで、前のページを
   含まない。

   `truncated` は最後にしか言えない。**読んでいる途中を `truncated: true` で表さない** ——
   あちらは「上限に当たって、その先を読んでいない」であって、まだ届いていないことではない。 */
export type GithubIssueDiscussionChunk =
  | { readonly kind: 'head'; readonly head: Observation<null> }
  | { readonly kind: 'page'; readonly entries: readonly GithubIssueDiscussionEntry[] }
  | { readonly kind: 'complete'; readonly truncated: boolean };

export interface GetGithubIssueDiscussionUseCase {
  execute(
    input: GetGithubIssueDiscussionInput,
  ): Promise<Result<Observation<GithubIssueDiscussion>, never>>;
  /** 読めたページから順に配る。`execute` はこれを汲み尽くしたものである */
  stream(
    input: GetGithubIssueDiscussionInput,
  ): AsyncGenerator<GithubIssueDiscussionChunk, void, void>;
}

/* やり取りで名指された人。**顔を引ける先を、観た通りに覚えるためだけに集める。**

   一覧に出てくるのは担当と書いた人だけなので、ラベルを付けた人も改題した人も一覧には居ない。
   ここで覚えておかないと、その人の顔だけがどのプロジェクトからも引けない。 */
function actorsIn(entries: readonly GithubIssueDiscussionEntry[]): readonly GithubActor[] {
  const found: GithubActor[] = [];
  for (const entry of entries) {
    if (entry.actor !== null) found.push(entry.actor);
    if ((entry.kind === 'assigned' || entry.kind === 'unassigned') && entry.assignee !== null) {
      found.push(entry.assignee);
    }
  }
  return found;
}

export function createGetGithubIssueDiscussion(deps: {
  readonly git: GitCommandIntegration;
  readonly tracker: IssueTrackerIntegration;
  readonly avatars: AvatarCacheService;
}): GetGithubIssueDiscussionUseCase {
  async function* walk({
    projectPath,
    number,
  }: GetGithubIssueDiscussionInput): AsyncGenerator<GithubIssueDiscussionChunk, void, void> {
    const source = await locateGithubRepository(deps.git, projectPath);
    if (source.kind !== 'observed') {
      yield { kind: 'head', head: source };
      yield { kind: 'complete', truncated: false };
      return;
    }
    const { repository } = source.value;

    let cursor: string | null = null;
    let truncated = false;
    let opened = false;

    for (let page = 0; page < MAX_PAGES; page++) {
      const answer = await deps.tracker.fetchIssueDiscussion({
        owner: repository.owner,
        name: repository.name,
        number,
        cursor,
      });
      /* 1 ページ目で躓いたなら、観測そのものが成り立っていない。2 ページ目より後なら、
         そこまでは観えている — **観えたぶんを捨てない。** 捨てると、途中で `gh` が
         答えなくなった瞬間に、それまでのやり取りごと消える。 */
      if (answer.kind !== 'observed') {
        if (!opened) {
          yield { kind: 'head', head: answer };
          yield { kind: 'complete', truncated: false };
          return;
        }
        truncated = true;
        break;
      }

      const parsed = parseIssueDiscussion(answer.value);
      /* 応答から課題を辿れなかった。閉じて消された番号も、こちらの数え違いもここへ来る。
       **観測できなかったことにしない** —— `gh` は答えていて、その答えに無かった。 */
      if (parsed === null) {
        if (!opened) {
          yield { kind: 'head', head: absent('empty') };
          yield { kind: 'complete', truncated: false };
          return;
        }
        truncated = true;
        break;
      }

      /* 名指された人の顔を引ける先を、そのページを配る前に覚える。**配ってから覚えては
         いけない** —— 画面はチャンクが着いた時点で顔を取りに行き、そこで断られた画像を
         ブラウザーは取り直さない。 */
      deps.avatars.rememberActors(actorsIn(parsed.entries));

      if (!opened) {
        yield { kind: 'head', head: observed(null) };
        opened = true;
      }
      yield { kind: 'page', entries: parsed.entries };

      if (!parsed.hasNextPage || parsed.endCursor === null) break;
      cursor = parsed.endCursor;
      // 次の周回に入れないなら、その先は読んでいない
      if (page === MAX_PAGES - 1) truncated = true;
    }

    yield { kind: 'complete', truncated };
  }

  return {
    stream: walk,
    async execute(input) {
      let head: Observation<null> | null = null;
      const entries: GithubIssueDiscussionEntry[] = [];
      let truncated = false;

      for await (const chunk of walk(input)) {
        if (chunk.kind === 'head') head = chunk.head;
        else if (chunk.kind === 'complete') truncated = chunk.truncated;
        else entries.push(...chunk.entries);
      }

      /* 配り終える前に `head` が来ないことは無い。それでも観測が成り立たなかった側へ倒すのは、
         成り立ったことにすると、1 件も観ていないやり取りが「まだ誰も書いていない」として
         出るからである。 */
      if (head === null || head.kind !== 'observed') {
        return ok(head ?? absent('empty'));
      }

      /* 誰も何も言っていない課題は、空の並びとして観測できている。`absent` にすると
         「まだ誰も書いていない」と「読みに行けなかった」が同じ画面になる。 */
      return ok(observed({ entries, truncated }));
    },
  };
}
