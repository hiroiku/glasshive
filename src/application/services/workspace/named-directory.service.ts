import { isSafeAbsolutePath, pathBasename, samePath } from '~/app-kernel/path.ts';
import {
  blockingFailure,
  type GitCommandIntegration,
  outputOrEmpty,
} from '~/application/ports/integrations/git/git-command.integration.ts';
import { parseWorktreeList } from '~/domain/services/git/porcelain-parsing.service.ts';

/* 名指されたディレクトリを覚えて、リポジトリ 1 つに読み替える。

   名指すのは 2 通りある。起動のときにパスを打つのと、**すでに走っている glasshive へ
   あとから伝える**のである。サーバーは 1 つに保つので、2 枚目以降の `glasshive .` は
   自分で立ち上がらずにここへ伝えに来る —— 走査も索引もその 1 つが持っているものを使う。

   **どこを打っても同じリポジトリに着く**のがここの仕事である。リポジトリの下の作業
   ディレクトリを打っても、worktree を打っても、着く先は同じでなければならない。
   `git` がそこをリポジトリだと言わなければ、打たれたパスがそのまま単位になる ——
   Claude Code を走らせただけのディレクトリでも観る相手になるので、リポジトリでないことは
   失敗ではない。 */

export interface NamedDirectory {
  /** 打たれたパス。絶対パスに直してある */
  readonly requestedPath: string;
  /** リポジトリの根。`git` が答えなければ、打たれたパスそのもの */
  readonly rootPath: string;
  readonly name: string;
  /** 同じリポジトリの worktree。根そのものは含まない */
  readonly worktrees: readonly string[];
}

export interface NamedDirectoryService {
  /** 起動のときに名指されたもの。名指されていなければ `null` */
  launched(): Promise<NamedDirectory | null>;
  /** 名指されたことを覚えて、リポジトリ 1 つに読み替える。パスとして読めなければ `null` */
  name(path: string): Promise<NamedDirectory | null>;
  /** ここまでに名指されたもの全部。起動のときの相手も含む */
  all(): Promise<readonly NamedDirectory[]>;
}

export function createNamedDirectories(deps: {
  /** 起動のときに名指されたパス。名指されていなければ `null` */
  readonly target: string | null;
  readonly git: GitCommandIntegration;
}): NamedDirectoryService {
  const answers = new Map<string, NamedDirectory>();
  /* `git` を起こせなかったパス。**覚えた答えを次も使ってよいのは、`git` が答えたときだけ**
     —— 権利や時間切れは次に尋ねれば変わることが在り、一度きりの失敗を覚えると worktree が
     最後まで見えないままになる。 */
  const unanswered = new Set<string>();

  async function resolve(path: string): Promise<{ directory: NamedDirectory; answered: boolean }> {
    const top = await deps.git.run({
      cwd: path,
      args: ['rev-parse', '--show-toplevel'],
      revisions: [],
    });
    const blocked = blockingFailure([top]);
    const rootPath = outputOrEmpty(top).trim();
    if (rootPath === '') {
      return {
        directory: { requestedPath: path, rootPath: path, name: pathBasename(path), worktrees: [] },
        answered: blocked === null,
      };
    }

    const list = await deps.git.run({
      cwd: rootPath,
      args: ['worktree', 'list', '--porcelain'],
      revisions: [],
    });
    return {
      directory: {
        requestedPath: path,
        rootPath,
        name: pathBasename(rootPath),
        worktrees: parseWorktreeList(outputOrEmpty(list))
          .map((worktree) => worktree.path)
          .filter((at) => !samePath(at, rootPath)),
      },
      answered: blockingFailure([list]) === null,
    };
  }

  async function name(path: string): Promise<NamedDirectory | null> {
    /* パスとして使えない文字列。**ここで落とす** —— この先は全部、絶対パスであることを
       前提にした突き合わせである。 */
    if (!isSafeAbsolutePath(path)) return null;

    const remembered = answers.get(path);
    if (remembered !== undefined && !unanswered.has(path)) return remembered;

    const { directory, answered } = await resolve(path);
    answers.set(path, directory);
    if (answered) unanswered.delete(path);
    else unanswered.add(path);
    return directory;
  }

  return {
    name,
    launched: async () => (deps.target === null ? null : await name(deps.target)),
    /* 起動のときの相手を先に確かめる。**確かめないと、まだ一度も尋ねられていない
       glasshive の一覧に、名指されたディレクトリが載らない。** */
    async all() {
      if (deps.target !== null) await name(deps.target);
      return [...answers.values()];
    },
  };
}
