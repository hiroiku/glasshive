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

export interface GetGithubIssueDiscussionUseCase {
  execute(
    input: GetGithubIssueDiscussionInput,
  ): Promise<Result<Observation<GithubIssueDiscussion>, never>>;
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
  return {
    async execute({ projectPath, number }) {
      const source = await locateGithubRepository(deps.git, projectPath);
      if (source.kind !== 'observed') return ok(source);
      const { repository } = source.value;

      const entries: GithubIssueDiscussionEntry[] = [];
      let cursor: string | null = null;
      let truncated = false;

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
          if (page === 0) return ok(answer);
          truncated = true;
          break;
        }

        const parsed = parseIssueDiscussion(answer.value);
        /* 応答から課題を辿れなかった。閉じて消された番号も、こちらの数え違いもここへ来る。
         **観測できなかったことにしない** —— `gh` は答えていて、その答えに無かった。 */
        if (parsed === null) {
          if (page === 0) return ok(absent('empty'));
          truncated = true;
          break;
        }

        entries.push(...parsed.entries);
        if (!parsed.hasNextPage || parsed.endCursor === null) break;
        cursor = parsed.endCursor;
        // 次の周回に入れないなら、その先は読んでいない
        if (page === MAX_PAGES - 1) truncated = true;
      }

      /* 名指された人の顔を引ける先を覚える。**読めたぶんだけ覚える** —— 途中で切れた
         やり取りでも、そこまでに出てきた人の顔は引けるべきである。 */
      deps.avatars.rememberActors(actorsIn(entries));

      /* 誰も何も言っていない課題は、空の並びとして観測できている。`absent` にすると
         「まだ誰も書いていない」と「読みに行けなかった」が同じ画面になる。 */
      return ok(observed({ entries, truncated }));
    },
  };
}
