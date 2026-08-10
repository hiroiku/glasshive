import type { JsonRecord } from '~/app-kernel/json.ts';
import type { Observation } from '~/app-kernel/observation.ts';
import { observed } from '~/app-kernel/observation.ts';
import { ok, type Result } from '~/app-kernel/result.ts';
import type { GitCommandIntegration } from '~/application/ports/integrations/git/git-command.integration.ts';
import type { IssueTrackerIntegration } from '~/application/ports/integrations/issues/issue-tracker.integration.ts';
import type { AvatarCacheService } from '~/application/services/issues/avatar-cache.service.ts';
import { locateGithubRepository } from '~/application/services/issues/github-repository.service.ts';
import type {
  GithubActor,
  GithubIssueExtra,
} from '~/domain/entities/issues/github-issue.entity.ts';
import type { IssueLedger } from '~/domain/entities/issues/issue.entity.ts';
import { buildLedger, parseIssuePage } from '~/domain/services/issues/github-issue.service.ts';

/* プロジェクト 1 つぶんの GitHub の課題を一覧にする。

   尋ね先を決めるのは `locateGithubRepository` である。そこが `git` の remote を読むので、
   **その失敗をそのまま課題の失敗にしない。** remote を持たないリポジトリも、そもそも git の
   リポジトリでないディレクトリも、「GitHub の課題が無い」であって「課題を読めなかった」
   ではない。 */

/* GitHub の課題が持つ形は、外へ出すときにもそのまま要る。
   `interface` は domain を直に見られないので、ここが受け渡しの場所になる。 */
export type { GithubActor, GithubIssueExtra, IssueLedger };

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

export interface ListGithubIssuesUseCase {
  execute(input: ListGithubIssuesInput): Promise<Result<Observation<IssueLedger>, never>>;
}

export function createListGithubIssues(deps: {
  readonly git: GitCommandIntegration;
  readonly tracker: IssueTrackerIntegration;
  /* 顔を覚えておくところ。**引ける顔をここで入れ替える** ——
     観測した一覧に出てこない login を引けるままにしておくと、この画面は
     「任意の宛先へ代わりに取りに行く踏み台」に近づく。 */
  readonly avatars: AvatarCacheService;
}): ListGithubIssuesUseCase {
  return {
    async execute({ projectPath, includeClosed }) {
      const repository = await locateGithubRepository(deps.git, projectPath);
      if (repository.kind !== 'observed') return ok(repository);

      const nodes: JsonRecord[] = [];
      let cursor: string | null = null;
      let truncated = false;

      for (let page = 0; page < MAX_PAGES; page++) {
        const answer = await deps.tracker.fetchIssuePage({
          owner: repository.value.owner,
          name: repository.value.name,
          cursor,
          pageSize: PAGE_SIZE,
        });
        /* 1 ページ目で躓いたなら、観測そのものが成り立っていない。2 ページ目より後なら、
           そこまでは観えている — **観えたぶんを捨てない。** 捨てると、認証が切れた瞬間に
           一覧が空になり、課題が 1 件も無いように見える。 */
        if (answer.kind !== 'observed') {
          if (page === 0) return ok(answer);
          truncated = true;
          break;
        }

        const parsed = parseIssuePage(answer.value);
        nodes.push(...parsed.nodes);
        if (!parsed.hasNextPage || parsed.endCursor === null) break;
        cursor = parsed.endCursor;
        // 次の周回に入れないなら、その先は読んでいない
        if (page === MAX_PAGES - 1) truncated = true;
      }

      const ledger = buildLedger(nodes, { includeClosed, truncated });
      deps.avatars.remember(ledger);
      /* 顔は待たずに先へ読んでおく。ブラウザーが求める頃にはメモリに在る。
       **取れなくても一覧は出る** — 顔は誰なのかを言うだけで、状態を言わない。 */
      deps.avatars.warm(ledger);
      return ok(observed(ledger));
    },
  };
}
