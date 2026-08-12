import type { JsonRecord } from '~/app-kernel/json.ts';
import type { Observation } from '~/app-kernel/observation.ts';
import { observed, unobservable } from '~/app-kernel/observation.ts';
import { ok, type Result } from '~/app-kernel/result.ts';
import { TrackerResponseUnreadableError } from '~/application/errors/issues/tracker-response.error.ts';
import type { GitCommandIntegration } from '~/application/ports/integrations/git/git-command.integration.ts';
import type { IssueTrackerIntegration } from '~/application/ports/integrations/issues/issue-tracker.integration.ts';
import type { AvatarCacheService } from '~/application/services/issues/avatar-cache.service.ts';
import {
  type GithubSource,
  locateGithubRepository,
} from '~/application/services/issues/github-repository.service.ts';
import type {
  GithubActor,
  GithubIssueExtra,
} from '~/domain/entities/issues/github-issue.entity.ts';
import type { IssueLedger, IssueSummary } from '~/domain/entities/issues/issue.entity.ts';
import { buildLedger, parseIssuePage } from '~/domain/services/issues/github-issue.service.ts';

/* プロジェクト 1 つぶんの GitHub の課題を一覧にする。

   尋ね先を決めるのは `locateGithubRepository` である。そこが `git` の remote を読むので、
   **その失敗をそのまま課題の失敗にしない。** remote を持たないリポジトリも、そもそも git の
   リポジトリでないディレクトリも、「GitHub の課題が無い」であって「課題を読めなかった」
   ではない。 */

/* GitHub の課題が持つ形は、外へ出すときにもそのまま要る。
   `interface` は domain を直に見られないので、ここが受け渡しの場所になる。 */
export type { GithubActor, GithubIssueExtra, IssueLedger, IssueSummary };

/* 1 ページで求める件数と、辿るページ数の上限。

   GitHub は 1 ページ 100 件までしか返さない。上限を置くのは、課題が数千件あるリポジトリで
   画面を開くたびに数十回の問い合わせが走るのを避けるためである。**当たったことは
   `truncated` で持ち回る** — 黙って切ると、上限より後ろの課題が「無かった」ことになる。 */
const PAGE_SIZE = 100;
const MAX_PAGES = 5;

export interface ListGithubIssuesInput {
  readonly projectPath: string;
  /** 閉じた課題も一覧に載せるか。載せなくても件数には出る */
  readonly includeClosed: boolean;
}

/* 一覧と、その一覧をどこから取ったか。

   **尋ね先を答えに添える。** remote を 2 つ以上持つプロジェクトでは glasshive が 1 つ選んで
   いるので、どちらを見ているのかを画面が言えないと、選ばれなかった側の課題が
   「無い」ものとして読まれる。 */
export interface IssueListing {
  readonly ledger: IssueLedger;
  readonly source: GithubSource;
}

/* 一覧の届き方。**ページ 1 の 100 件に、ページ 5 を待つ理由は無い。**

   最初に来るのは `head` 1 つで、そこに観測が成り立ったかどうかが入る。成り立っていなければ
   それが答えの全部で、`page` は 1 つも来ない。**`head` を配れるのはページ 1 を読んだ後である**
   —— 尋ね先が引けても、ページ 1 が読めなければ課題を 1 件も観ていないので、そこは
   `unobservable` である。

   `page` はページ 1 つぶんの一覧で、前のページを参照しない。`buildLedger` がページを
   またいで何も見ないので、ページごとの一覧を並べたものと、全部をまとめて数えたものは同じに
   なる。積み上げるのは受け取る側でよい。 */
export type IssueListingChunk =
  | { readonly kind: 'head'; readonly head: Observation<IssueListingHead> }
  | { readonly kind: 'page'; readonly ledger: IssueLedger }
  /** 読み終えた。上限に当たったか、途中で読めなくなったなら `truncated` */
  | { readonly kind: 'complete'; readonly truncated: boolean };

/** 一覧より先に分かること。尋ね先はページを 1 枚も読まなくても決まっている */
export interface IssueListingHead {
  readonly source: GithubSource;
}

export interface ListGithubIssuesUseCase {
  execute(input: ListGithubIssuesInput): Promise<Result<Observation<IssueListing>, never>>;
  /** 読めたページから順に配る。`execute` はこれを汲み尽くしたものである */
  stream(input: ListGithubIssuesInput): AsyncGenerator<IssueListingChunk, void, void>;
}

export function createListGithubIssues(deps: {
  readonly git: GitCommandIntegration;
  readonly tracker: IssueTrackerIntegration;
  /* 顔を覚えておくところ。**このプロジェクトで引ける顔をここで入れ替える** ——
     観測した一覧に出てこない login を引けるままにしておくと、この画面は
     「任意の宛先へ代わりに取りに行く踏み台」に近づく。 */
  readonly avatars: AvatarCacheService;
}): ListGithubIssuesUseCase {
  async function* walk({
    projectPath,
    includeClosed,
  }: ListGithubIssuesInput): AsyncGenerator<IssueListingChunk, void, void> {
    const source = await locateGithubRepository(deps.git, projectPath);
    if (source.kind !== 'observed') {
      yield { kind: 'head', head: source };
      yield { kind: 'complete', truncated: false };
      return;
    }
    const { repository } = source.value;

    /* 覚えた顔を入れ替えるための、ここまでに観た全部。**ページごとには入れ替えられない** ——
       `remember` はプロジェクト 1 つぶんを丸ごと置き換えるので、ページ 2 で入れ替えると
       ページ 1 に出ていた人の顔が引けなくなる。 */
    const seen: JsonRecord[] = [];
    let cursor: string | null = null;
    let truncated = false;
    let opened = false;

    /* 配る前に、そのページに出てきた人を引けるようにしておく。**順序が要る** ——
       配った後に覚えると、届いた行が顔を求める瞬間にまだ引けないことが在り、
       ブラウザーは取れなかった画像を取り直さない。 */
    const remember = (ledger: IssueLedger) => {
      deps.avatars.remember(projectPath, ledger);
      /* 顔は待たずに先へ読んでおく。ブラウザーが求める頃にはメモリに在る。
       **取れなくても一覧は出る** — 顔は誰なのかを言うだけで、状態を言わない。 */
      deps.avatars.warm(ledger);
    };

    for (let page = 0; page < MAX_PAGES; page++) {
      const answer = await deps.tracker.fetchIssuePage({
        owner: repository.owner,
        name: repository.name,
        cursor,
        pageSize: PAGE_SIZE,
      });
      /* 1 ページ目で躓いたなら、観測そのものが成り立っていない。2 ページ目より後なら、
         そこまでは観えている — **観えたぶんを捨てない。** 捨てると、認証が切れた瞬間に
         一覧が空になり、課題が 1 件も無いように見える。 */
      if (answer.kind !== 'observed') {
        if (!opened) {
          yield { kind: 'head', head: answer };
          yield { kind: 'complete', truncated: false };
          return;
        }
        truncated = true;
        break;
      }

      /* 応答を歩けなかった。**歩けて 0 件だったのと同じに扱わない。** 1 ページ目なら
         課題を 1 件も観ていないのだから、観測が成り立っていない。2 ページ目より後なら、
         そこまでは観えている — 観えたぶんを捨てず、その先を読んでいないことだけを言う。 */
      const parsed = parseIssuePage(answer.value);
      if (parsed === null) {
        if (!opened) {
          yield {
            kind: 'head',
            head: unobservable(
              new TrackerResponseUnreadableError('gh answered, but the issues could not be read'),
            ),
          };
          yield { kind: 'complete', truncated: false };
          return;
        }
        truncated = true;
        break;
      }

      seen.push(...parsed.nodes);
      remember(buildLedger(seen, { includeClosed, truncated: false }));
      if (!opened) {
        yield { kind: 'head', head: observed({ source: source.value }) };
        opened = true;
      }
      /* このページぶんだけを配る。積み上げるのは受け取る側で、そちらは前のページを持っている */
      yield {
        kind: 'page',
        ledger: buildLedger(parsed.nodes, { includeClosed, truncated: false }),
      };

      if (!parsed.hasNextPage) break;
      /* 続きが在ると言われたのに、次を尋ねる位置が答えられていない。ここで黙って止めると、
         続きの課題が「無かった」ことになる。 */
      if (parsed.endCursor === null) {
        truncated = true;
        break;
      }
      cursor = parsed.endCursor;
      // 次の周回に入れないなら、その先は読んでいない
      if (page === MAX_PAGES - 1) truncated = true;
    }

    yield { kind: 'complete', truncated };
  }

  return {
    stream: walk,
    async execute(input) {
      let head: Observation<IssueListingHead> | null = null;
      const issues: IssueSummary[] = [];
      const counts: Record<string, number> = Object.create(null);
      let truncated = false;

      for await (const chunk of walk(input)) {
        if (chunk.kind === 'head') head = chunk.head;
        else if (chunk.kind === 'complete') truncated = chunk.truncated;
        else {
          issues.push(...chunk.ledger.issues);
          for (const [status, count] of Object.entries(chunk.ledger.counts)) {
            counts[status] = (counts[status] ?? 0) + count;
          }
        }
      }

      /* 配り終える前に `head` が来ないことは無い。それでも観測が成り立たなかった側へ倒すのは、
         成り立ったことにすると、1 件も観ていない一覧が「課題が 1 件も無い」として出るからである。 */
      if (head === null || head.kind !== 'observed') {
        return ok(
          head ??
            unobservable(
              new TrackerResponseUnreadableError('the issue walk ended without an answer'),
            ),
        );
      }
      return ok(observed({ ledger: { issues, counts, truncated }, source: head.value.source }));
    },
  };
}
