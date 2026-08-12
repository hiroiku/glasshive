import { isSafeAbsolutePath, pathBasename, samePath } from '~/app-kernel/path.ts';
import {
  blockingFailure,
  type GitCommandIntegration,
  outputOrEmpty,
} from '~/application/ports/integrations/git/git-command.integration.ts';
import { parseWorktreeList } from '~/domain/services/git/porcelain-parsing.service.ts';

/* 起動のときに名指されたディレクトリを、リポジトリ 1 つに読み替える。

   打たれるのはパス 1 つだが、そこに在るのはたいていリポジトリで、リポジトリは根と
   worktree に分かれている。**どこを打っても同じリポジトリに着く**ようにするのがここの仕事で、
   どのプロジェクトを開くかを決めるのはこの先である。

   `git` がそこをリポジトリだと言わなければ、打たれたパスがそのまま単位になる。
   Claude Code を走らせただけのディレクトリでも観る相手になるので、リポジトリでないことは
   失敗ではない。 */

export interface TargetRoot {
  /** 打たれたパス。絶対パスに直してある */
  readonly requestedPath: string;
  /** リポジトリの根。`git` が答えなければ、打たれたパスそのもの */
  readonly rootPath: string;
  readonly name: string;
  /** 同じリポジトリの worktree。根そのものは含まない */
  readonly worktrees: readonly string[];
}

export interface TargetRootService {
  /** 名指されていなければ `null` */
  get(): Promise<TargetRoot | null>;
}

export function createTargetRoot(deps: {
  readonly target: string | null;
  readonly git: GitCommandIntegration;
}): TargetRootService {
  let settled: Promise<TargetRoot | null> | undefined;

  async function resolve(): Promise<{ root: TargetRoot | null; keep: boolean }> {
    const target = deps.target;
    /* 打たれていないか、パスとして使えない文字列。**ここで落とす** —
       この先は全部、絶対パスであることを前提にした突き合わせである。 */
    if (target === null || !isSafeAbsolutePath(target)) return { root: null, keep: true };

    const top = await deps.git.run({
      cwd: target,
      args: ['rev-parse', '--show-toplevel'],
      revisions: [],
    });
    /* `git` を起こせなかったのと、そこがリポジトリでないのは別である。**起こせなかった
       答えは覚えない** —— インストールされていない機械では二度と変わらないが、権利や
       時間切れは次に尋ねれば変わることが在る。 */
    const blocked = blockingFailure([top]);
    const rootPath = outputOrEmpty(top).trim();
    if (rootPath === '') {
      return {
        root: {
          requestedPath: target,
          rootPath: target,
          name: pathBasename(target),
          worktrees: [],
        },
        keep: blocked === null,
      };
    }

    const list = await deps.git.run({
      cwd: rootPath,
      args: ['worktree', 'list', '--porcelain'],
      revisions: [],
    });
    return {
      root: {
        requestedPath: target,
        rootPath,
        name: pathBasename(rootPath),
        worktrees: parseWorktreeList(outputOrEmpty(list))
          .map((worktree) => worktree.path)
          .filter((path) => !samePath(path, rootPath)),
      },
      keep: blockingFailure([list]) === null,
    };
  }

  return {
    /* 名指されたパスは走っているあいだ変わらないので、答えも変わらない。**覚えるのは
       `git` が答えを返せたときだけ** —— 起こせなかった一度きりの失敗を覚えると、
       worktree がこのウィンドウでは最後まで見えないままになる。 */
    get() {
      settled ??= resolve().then((answer) => {
        if (!answer.keep) settled = undefined;
        return answer.root;
      });
      return settled;
    },
  };
}
