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

/* リポジトリをひと目ぶん観る。

   起こす回数は線の数で増える。線 1 本につき分かれ目・先・遅れ・触ったファイルで 4 回、
   線が 18 本なら 70 を超える。**同じ答えを出すことを先に決め、速さは並べることだけで稼ぐ**
   — 尋ねる事柄と数は旧実装と同じままにしてある。

   そこがリポジトリでないことは、旧実装と同じ見立てで決める。作業場所も枝も 1 つも無ければ
   リポジトリではない、という当てである。**それは「見に行けなかった」ではないので、
   `absent` で返す。** 記録を読む道具が手元に無いだけのときは、その前に諦めている。 */

/** この求めの出力。外へ写す側はこの名前だけを見る */
export type { GitOverview };

export interface ObserveRepositoryUseCase {
  /* 断る求めが無くても `Result` で返す。求めを受けてよいかと、観に行けたかは別の話で、
     受け取る側がその 2 つを毎回同じ順に開けるようにしておく。 */
  execute(projectPath: string): Promise<Result<Observation<GitOverview>>>;
}

export function createObserveRepository(deps: {
  readonly git: GitCommandIntegration;
  /** 覚えておく相手。無ければ毎回すべての線の差分を起こす(答えは変わらない) */
  readonly conflicts?: ConflictCacheService;
}): ObserveRepositoryUseCase {
  const { git, conflicts } = deps;

  /** 線 1 本ぶんの隔たりを数える。3 回起こすが、どれも他の線を待たない */
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

  /** 線どうしが同じファイルを触っていないかを見る。線 1 本につき 1 回起こす */
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
          // 分かれ目から先だけを見る。本流が進んだぶんは、この線が触ったものではない
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
      // 作業場所も枝も 1 つも無い。そこはリポジトリではない
      if (worktrees.length === 0 && branches.length === 0) return ok(absent('no-source'));

      // 統合の枝 = 主たる作業場所が出している枝。決められなければ、いま出ているものを縦軸にする
      const base = worktrees[0]?.branch || 'HEAD';
      const baseRev = Revision.fromGitOutput(base);
      // 縦軸がどこまで進んでいるか。見込みを覚えておく鍵に要る
      const baseSha =
        branches.find((branch) => branch.name === base)?.sha ?? worktrees[0]?.sha ?? '';

      const [mainlineOutput, unmergedOutput] = await Promise.all([
        git.run({
          cwd,
          args: [
            'log',
            '--first-parent',
            '-n',
            String(MAINLINE_LIMIT),
            `--format=${MAINLINE_FORMAT}`,
          ],
          revisions: [baseRev],
        }),
        /* 本流に入っていない枝を尋ねる。**`--no-merged` の相手は繋げて渡す。**
           離して渡すと `--end-of-options` のほうを相手として食われる。 */
        git.run({
          cwd,
          args: ['branch', `--format=${BRANCH_NAME_FORMAT}`, `--no-merged=${base}`],
          revisions: [],
        }),
      ]);
      const blockedDerived = blockingFailure([mainlineOutput, unmergedOutput]);
      if (blockedDerived !== null) return ok(unobservable(blockedDerived));

      const mainline = parseMainline(outputOrEmpty(mainlineOutput));
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
          tips,
          conflicts: forecasts.value,
        }),
      );
    },
  };
}
