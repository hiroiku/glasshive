import {
  absent,
  allObserved,
  type Observation,
  observed,
  unobservable,
} from '~/app-kernel/observation.ts';
import { ok, type Result } from '~/app-kernel/result.ts';
import {
  blockingFailure,
  type GitCommandIntegration,
  outputOrEmpty,
  unreadFailure,
} from '~/application/ports/integrations/git/git-command.integration.ts';
import {
  type ConflictCacheService,
  conflictCacheKey,
} from '~/application/services/git/conflict-cache.service.ts';
import type {
  ConflictForecast,
  GitOverview,
  Tip,
} from '~/domain/entities/git/git-overview.entity.ts';
import { forecastConflicts } from '~/domain/services/git/conflict-forecast.service.ts';
import {
  BRANCH_NAME_FORMAT,
  BRANCH_REF_FORMAT,
  MAINLINE_FORMAT,
  parseBranchNames,
  parseBranchRefs,
  parseChangedPaths,
  parseMainline,
  parseWorktreeList,
} from '~/domain/services/git/porcelain-parsing.service.ts';
import { selectTips, type TipCandidate } from '~/domain/services/git/tip-selection.service.ts';
import { parseCommitCount } from '~/domain/value-objects/git/ahead-behind.value-object.ts';
import {
  MAINLINE_LIMIT,
  shortSha,
} from '~/domain/value-objects/git/commit-summary.value-object.ts';
import { Revision, RevisionRange } from '~/domain/value-objects/git/revision.value-object.ts';

/* リポジトリの全体を 1 回で観る。

   起こす回数は先端の数で増える。先端 1 つにつき分かれ目・`ahead`・`behind`・触ったファイルで
   4 回、先端が 18 個なら 70 を超える。尋ねる事柄も回数も削らず、速さは並列に起こすことだけで
   稼ぐ。

   そこがリポジトリでないことは、`worktree` もブランチも 1 つも無ければリポジトリではない、という
   当てで決める。**それは観測できなかったのではないので、`absent` で返す。**
   `git` がインストールされていないだけのときは、その前に諦めている。ただし、その 2 つが
   空なのは `git` が答えなかったからでもありうる。**理由を読めていない失敗が 1 つでも在れば、
   「リポジトリではない」とは言わない** — 断られたリポジトリにそう言うと、画面は既に在る
   リポジトリへ `git init` を勧める。

   本流を遡る数には上限がある。上限に当たったことは `mainlineTruncated` で持ち回る —
   黙って切ると、遡る数より前で分かれたブランチが、いちばん古い見えているコミットで
   分かれたように描かれる。 */

/** この呼び出しの出力。外へ写す側はこの名前だけを見る */
export type { GitOverview };

export interface ObserveRepositoryUseCase {
  /* 断る呼び出しが無くても `Result` で返す。呼び出しを受けてよいかと、観測できたかは別の話で、
     受け取る側がその 2 つを毎回同じ順に開けるようにしておく。 */
  execute(projectPath: string): Promise<Result<Observation<GitOverview>>>;
}

export function createObserveRepository(deps: {
  readonly git: GitCommandIntegration;
  /** キャッシュ。無ければ毎回すべての先端の差分を起こす(結果は変わらない) */
  readonly conflicts?: ConflictCacheService;
}): ObserveRepositoryUseCase {
  const { git, conflicts } = deps;

  /** 先端 1 つぶんの隔たりを数える。3 回起こすが、どれも他の先端を待たない */
  async function measureTip(
    cwd: string,
    base: Revision,
    candidate: TipCandidate,
  ): Promise<Observation<Tip>> {
    const rev = Revision.fromGitOutput(candidate.rev);
    const sha = Revision.fromGitOutput(candidate.sha);
    const [mergeBase, ahead, behind] = await Promise.all([
      git.run({ cwd, args: ['merge-base'], revisions: [base, rev] }),
      git.run({
        cwd,
        args: ['rev-list', '--count'],
        revisions: [RevisionRange.between(base, rev)],
      }),
      git.run({
        cwd,
        args: ['rev-list', '--count'],
        revisions: [RevisionRange.between(sha, base)],
      }),
    ]);
    const blocked = blockingFailure([mergeBase, ahead, behind]);
    if (blocked !== null) return unobservable(blocked);
    return observed({
      kind: candidate.kind,
      name: candidate.name,
      sha: candidate.sha,
      date: candidate.date,
      subject: candidate.subject,
      worktree: candidate.worktree,
      mergeBase: shortSha(outputOrEmpty(mergeBase)),
      ahead: parseCommitCount(outputOrEmpty(ahead)),
      behind: parseCommitCount(outputOrEmpty(behind)),
    });
  }

  /** 先端どうしが同じファイルを触っていないかを見る。先端 1 つにつき 1 回起こす */
  async function observeConflicts(
    cwd: string,
    base: Revision,
    baseSha: string,
    tips: readonly Tip[],
  ): Promise<Observation<readonly ConflictForecast[]>> {
    const key = conflictCacheKey(
      base.value,
      baseSha,
      tips.map((tip) => tip.sha),
    );
    const remembered = conflicts?.get(cwd, key);
    if (remembered !== undefined) return observed(remembered);

    const touched = await Promise.all(
      tips.map(async (tip) => ({
        tip,
        output: await git.run({
          cwd,
          args: ['diff', '--name-only'],
          // 分かれ目から先だけを見る。本流が進んだぶんは、この先端が触ったものではない
          revisions: [RevisionRange.sinceFork(base, Revision.fromGitOutput(tip.sha))],
        }),
      })),
    );
    const blocked = blockingFailure(touched.map((entry) => entry.output));
    if (blocked !== null) return unobservable(blocked);

    const forecasts = forecastConflicts(
      touched.map((entry) => ({
        name: entry.tip.name,
        files: new Set(parseChangedPaths(outputOrEmpty(entry.output))),
      })),
    );
    conflicts?.set(cwd, key, forecasts);
    return observed(forecasts);
  }

  return {
    async execute(cwd) {
      const [worktreeOutput, branchOutput] = await Promise.all([
        git.run({
          cwd,
          args: ['worktree', 'list', '--porcelain'],
          revisions: [],
        }),
        git.run({
          cwd,
          args: [
            'for-each-ref',
            'refs/heads',
            '--sort=-committerdate',
            `--format=${BRANCH_REF_FORMAT}`,
          ],
          revisions: [],
        }),
      ]);
      const blocked = blockingFailure([worktreeOutput, branchOutput]);
      if (blocked !== null) return ok(unobservable(blocked));

      const worktrees = parseWorktreeList(outputOrEmpty(worktreeOutput));
      const branches = parseBranchRefs(outputOrEmpty(branchOutput));
      if (worktrees.length === 0 && branches.length === 0) {
        /* `worktree` もブランチも 1 つも無い。`git` がどちらにも答えたのなら、そこは
           リポジトリではない。答えなかった呼び出しが在るなら、無いのではなく観測できなかった。 */
        const unread = unreadFailure([worktreeOutput, branchOutput]);
        return ok(unread === null ? absent('no-source') : unobservable(unread));
      }

      // 統合ブランチ = 主たる `worktree` が出しているブランチ。決められなければ、いま出ているものを縦軸にする
      const base = worktrees[0]?.branch || 'HEAD';
      const baseRev = Revision.fromGitOutput(base);
      // 縦軸がどこまで進んでいるか。見込みを覚えておくキーに要る
      const baseSha =
        branches.find((branch) => branch.name === base)?.sha ?? worktrees[0]?.sha ?? '';

      const [mainlineOutput, unmergedOutput] = await Promise.all([
        /* 並べる上限より 1 つ多く尋ねる。**その 1 つが返ってきたかどうかが、上限より古い
           コミットが在るかの観測になる。** 尋ねる数を上限と揃えると、履歴がちょうど上限の
           リポジトリと、その先が在るリポジトリを見分けられない。 */
        git.run({
          cwd,
          args: [
            'log',
            '--first-parent',
            '-n',
            String(MAINLINE_LIMIT + 1),
            `--format=${MAINLINE_FORMAT}`,
          ],
          revisions: [baseRev],
        }),
        /* 本流に入っていないブランチを尋ねる。**`--no-merged` の相手は繋げて渡す。**
           離して渡すと `--end-of-options` のほうを相手として食われる。 */
        git.run({
          cwd,
          args: ['branch', `--format=${BRANCH_NAME_FORMAT}`, `--no-merged=${base}`],
          revisions: [],
        }),
      ]);
      const blockedDerived = blockingFailure([mainlineOutput, unmergedOutput]);
      if (blockedDerived !== null) return ok(unobservable(blockedDerived));

      const parsedMainline = parseMainline(outputOrEmpty(mainlineOutput));
      // 上限より多く返ってきた分は、その先が在ることを言うためだけのものなので並べない
      const mainlineTruncated = parsedMainline.length > MAINLINE_LIMIT;
      const mainline = parsedMainline.slice(0, MAINLINE_LIMIT);
      const unmerged = parseBranchNames(outputOrEmpty(unmergedOutput));
      const candidates = selectTips({ base, branches, worktrees, unmerged });

      const measured = allObserved(
        await Promise.all(candidates.map((candidate) => measureTip(cwd, baseRev, candidate))),
      );
      if (measured.kind !== 'observed') return ok(measured);
      const tips = measured.value;

      const forecasts = await observeConflicts(cwd, baseRev, baseSha, tips);
      if (forecasts.kind !== 'observed') return ok(forecasts);

      return ok(
        observed({
          base,
          worktrees,
          branches,
          mainline,
          mainlineTruncated,
          tips,
          conflicts: forecasts.value,
        }),
      );
    },
  };
}
