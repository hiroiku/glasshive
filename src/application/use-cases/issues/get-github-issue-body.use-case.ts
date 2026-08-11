import { absent, type Observation, observed } from '~/app-kernel/observation.ts';
import { ok, type Result } from '~/app-kernel/result.ts';
import type { GitCommandIntegration } from '~/application/ports/integrations/git/git-command.integration.ts';
import type { IssueTrackerIntegration } from '~/application/ports/integrations/issues/issue-tracker.integration.ts';
import { locateGithubRepository } from '~/application/services/issues/github-repository.service.ts';
import { parseIssueBody } from '~/domain/services/issues/github-issue.service.ts';

/* GitHub の課題 1 件の本文を引く。

   **一覧とは別の呼び出しである。** 一覧は本文を求めない —— 100 件ぶんの本文を運ぶと一覧そのものが
   開かなくなる。だからといって 1 件を開いたときにも本文が出ないのは行き過ぎで、課題を開く
   意味がほとんど無くなる。読む人が 1 件を開いたときに、その 1 件だけを尋ねる。

   尋ね先は一覧と同じ `locateGithubRepository` が決める。**別々に決めてはいけない** ——
   一覧に出ていた課題を開いたら別のリポジトリを尋ねた、では番号の指す先が変わる。 */

export interface GetGithubIssueBodyInput {
  readonly projectPath: string;
  /** 課題の番号。一覧に出ていたものを渡す */
  readonly number: number;
}

export interface GetGithubIssueBodyUseCase {
  execute(input: GetGithubIssueBodyInput): Promise<Result<Observation<string>, never>>;
}

export function createGetGithubIssueBody(deps: {
  readonly git: GitCommandIntegration;
  readonly tracker: IssueTrackerIntegration;
}): GetGithubIssueBodyUseCase {
  return {
    async execute({ projectPath, number }) {
      const source = await locateGithubRepository(deps.git, projectPath);
      if (source.kind !== 'observed') return ok(source);
      const { repository } = source.value;

      const answer = await deps.tracker.fetchIssueBody({
        owner: repository.owner,
        name: repository.name,
        number,
      });
      if (answer.kind !== 'observed') return ok(answer);

      const body = parseIssueBody(answer.value);
      /* 応答から課題を辿れなかった。閉じて消された番号も、こちらの数え違いもここへ来る。
       **観測できなかったことにしない** —— `gh` は答えていて、その答えに無かった。 */
      if (body === null) return ok(absent('empty'));
      /* 本文の無い課題は、空の本文が書かれている課題である。`absent` にすると
         「本文が無い」と「読みに行けなかった」が同じ画面になる。 */
      return ok(observed(body));
    },
  };
}
