import { describe, expect, it } from 'vitest';
import { UnexpectedError } from '~/app-kernel/error.ts';
import { observed, unobservable } from '~/app-kernel/observation.ts';
import type { GitCommandIntegration } from '~/application/ports/integrations/git/git-command.integration.ts';
import { createTargetRoot } from '~/application/services/workspace/target-root.service.ts';

/* 起動のときに名指されたディレクトリを、リポジトリ 1 つに読み替える。

   **どこを打っても同じリポジトリに着く**のがここの仕事である。リポジトリの下の作業
   ディレクトリを打っても、worktree を打っても、着く先は同じでなければならない ——
   着く先が打ち方で変わると、同じコマンドが日によって別のプロジェクトを開く。 */

const REPO = '/src/repo';

/** 尋ねられたサブコマンドで答えを引く偽の `git`。答えの無い問いは非ゼロで終わったものとして返す */
function gitOf(answers: Record<string, string>, denied = false): GitCommandIntegration {
  return {
    async run(request) {
      if (denied) return unobservable(new UnexpectedError('git を起こせない'));
      const key = request.args.join(' ');
      return observed(answers[key] ?? '');
    },
  };
}

const WORKTREES = ['worktree /src/repo', 'worktree /src/repo-wt', 'worktree /src/repo-old'].join(
  '\n',
);

describe('名指されたディレクトリの読み替え', () => {
  it('リポジトリの根まで登り、worktree を並べる', async () => {
    const root = await createTargetRoot({
      target: `${REPO}/apps/web`,
      git: gitOf({
        'rev-parse --show-toplevel': `${REPO}\n`,
        'worktree list --porcelain': WORKTREES,
      }),
    }).get();

    expect(root?.requestedPath, '打った相手は控えておく。画面にはこちらを出す').toBe(
      `${REPO}/apps/web`,
    );
    expect(root?.rootPath).toBe(REPO);
    expect(root?.name).toBe('repo');
    expect(root?.worktrees, '根そのものは worktree の一覧にも出るが、残りではない').toEqual([
      '/src/repo-wt',
      '/src/repo-old',
    ]);
  });

  /* Claude Code を走らせただけのディレクトリも観る相手になる。**リポジトリでないことは
     失敗ではない。** */
  it('リポジトリでなければ、打たれたパスがそのまま単位になる', async () => {
    const root = await createTargetRoot({ target: '/tmp/notes', git: gitOf({}) }).get();

    expect(root?.rootPath).toBe('/tmp/notes');
    expect(root?.name).toBe('notes');
    expect(root?.worktrees).toEqual([]);
  });

  it('名指されていなければ、読み替える相手が無い', async () => {
    expect(await createTargetRoot({ target: null, git: gitOf({}) }).get()).toBe(null);
  });

  /* `git` を起こせなかったのと、そこがリポジトリでないのは別である。前者を覚えると、
     一度きりの失敗のせいで worktree がこのウィンドウでは最後まで見えないままになる。 */
  it('`git` を起こせなかった答えは覚えない', async () => {
    let denied = true;
    const service = createTargetRoot({
      target: REPO,
      git: {
        async run(request) {
          if (denied) return unobservable(new UnexpectedError('git を起こせない'));
          return observed(
            request.args[0] === 'rev-parse' ? `${REPO}\n` : 'worktree /src/repo\nworktree /src/x',
          );
        },
      },
    });

    const blocked = await service.get();
    expect(blocked?.worktrees, '起こせなかった周では、worktree は 1 つも見えない').toEqual([]);

    denied = false;
    const answered = await service.get();
    expect(answered?.worktrees, '覚えたままだと、次に尋ねても見えないままになる').toEqual([
      '/src/x',
    ]);
  });
});
