import { absent, type Observation, observed, unobservable } from '~/app-kernel/observation.ts';
import { err, ok, type Result } from '~/app-kernel/result.ts';
import {
  blockingFailure,
  type GitCommandIntegration,
  outputOrEmpty,
} from '~/application/ports/integrations/git/git-command.integration.ts';
import type { RefDetail } from '~/domain/entities/git/ref-detail.entity.ts';
import {
  COMMIT_LOG_FORMAT,
  parseCommitLog,
  parseNumstat,
} from '~/domain/services/git/porcelain-parsing.service.ts';
import { parseCommitCount } from '~/domain/value-objects/git/ahead-behind.value-object.ts';
import {
  type CommitSummary,
  RECENT_LOG_LIMIT,
  UNIQUE_LOG_LIMIT,
} from '~/domain/value-objects/git/commit-summary.value-object.ts';
import { summarizeDiff } from '~/domain/value-objects/git/diff-stat.value-object.ts';
import { Revision, RevisionRange } from '~/domain/value-objects/git/revision.value-object.ts';

/* 指し 1 つを近くで観る。

   **求めと共に来た字は、形を確かめてからでないと git まで届かない。**
   確かめを飛ばすと `--upload-pack=…` のような指定が紛れ込み、外の道具を差し替えられる。
   形が違うのは観測の失敗ではなく断るべき求めなので、`Observation` ではなく `Result` で返す。

   並べるのは「本流にまだ入っていない記録」で、無いときだけ直近の記録に落とす。
   どちらを並べたかは `unique` に残る — 同じ一覧でも読み方がまるで違う。 */

export interface ObserveRefRequest {
  readonly projectPath: string;
  readonly rev: string;
  /** 比べる相手。空なら、いま出ている枝を相手にする */
  readonly base: string | null;
}

/** この求めの出力。外へ写す側はこの名前だけを見る */
export type { RefDetail };

export interface ObserveRefUseCase {
  /* 断った理由は名札でしか読まない。誤りの型そのものを外へ差し出すと、
     外の層が内側の型を辿れてしまう。 */
  execute(request: ObserveRefRequest): Promise<Result<Observation<RefDetail>>>;
}

export function createObserveRef(deps: { readonly git: GitCommandIntegration }): ObserveRefUseCase {
  const { git } = deps;

  /** いま出ている枝。名前が引けなければ、比べる相手を決めない */
  async function currentBranch(cwd: string): Promise<Observation<Revision | null>> {
    const output = await git.run({
      cwd,
      args: ['rev-parse', '--abbrev-ref', 'HEAD'],
      revisions: [],
    });
    const blocked = blockingFailure([output]);
    if (blocked !== null) return unobservable(blocked);
    const name = outputOrEmpty(output).trim();
    return observed(name === '' ? null : Revision.fromGitOutput(name));
  }

  async function readLog(
    cwd: string,
    limit: number,
    revisions: readonly [Revision | RevisionRange],
  ): Promise<Observation<CommitSummary[]>> {
    const output = await git.run({
      cwd,
      args: ['log', '-n', String(limit), `--format=${COMMIT_LOG_FORMAT}`],
      revisions,
    });
    const blocked = blockingFailure([output]);
    if (blocked !== null) return unobservable(blocked);
    return observed(parseCommitLog(outputOrEmpty(output)));
  }

  return {
    async execute(request) {
      const parsedRev = Revision.create(request.rev);
      if (!parsedRev.ok) return err(parsedRev.error);
      const rev = parsedRev.value;

      let base: Revision | null = null;
      if (request.base !== null && request.base !== '') {
        const parsedBase = Revision.create(request.base);
        if (!parsedBase.ok) return err(parsedBase.error);
        base = parsedBase.value;
      } else {
        const current = await currentBranch(request.projectPath);
        if (current.kind !== 'observed') return ok(current);
        base = current.value;
      }
      // 自分と自分を比べても、隔たりは出ない
      if (base !== null && base.value === rev.value) base = null;

      /* 本流に入っていない記録を先に尋ねる。1 つも無いときだけ直近の記録に落とす。
         比べる相手が決まらなかったときは、はじめから直近の記録である。 */
      let unique = true;
      let commits: CommitSummary[] = [];
      if (base !== null) {
        const observedLog = await readLog(request.projectPath, UNIQUE_LOG_LIMIT, [
          RevisionRange.between(base, rev),
        ]);
        if (observedLog.kind !== 'observed') return ok(observedLog);
        commits = observedLog.value;
      }
      if (commits.length === 0) {
        unique = false;
        const observedLog = await readLog(request.projectPath, RECENT_LOG_LIMIT, [rev]);
        if (observedLog.kind !== 'observed') return ok(observedLog);
        commits = observedLog.value;
      }
      // 記録が 1 つも無い。そんな指しは無いか、まだ何も記録されていない
      if (commits.length === 0) return ok(absent('no-source'));

      if (base === null) {
        return ok(
          observed({
            rev: rev.value,
            base: null,
            unique,
            commits,
            stat: null,
            behind: 0,
            files: [],
          }),
        );
      }

      const [behindOutput, numstatOutput] = await Promise.all([
        git.run({
          cwd: request.projectPath,
          args: ['rev-list', '--count'],
          revisions: [RevisionRange.between(rev, base)],
        }),
        git.run({
          cwd: request.projectPath,
          args: ['diff', '--numstat'],
          // 分かれ目から先だけ。本流が進んだぶんは、この線が触ったものではない
          revisions: [RevisionRange.sinceFork(base, rev)],
        }),
      ]);
      const blocked = blockingFailure([behindOutput, numstatOutput]);
      if (blocked !== null) return ok(unobservable(blocked));

      const summary = summarizeDiff(parseNumstat(outputOrEmpty(numstatOutput)));
      return ok(
        observed({
          rev: rev.value,
          base: base.value,
          unique,
          commits,
          stat: summary.stat,
          behind: parseCommitCount(outputOrEmpty(behindOutput)),
          files: summary.files,
        }),
      );
    },
  };
}
