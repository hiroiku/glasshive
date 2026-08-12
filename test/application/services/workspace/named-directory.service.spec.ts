import { describe, expect, it } from 'vitest';
import { UnexpectedError } from '~/app-kernel/error.ts';
import { observed, unobservable } from '~/app-kernel/observation.ts';
import type { GitCommandIntegration } from '~/application/ports/integrations/git/git-command.integration.ts';
import { createNamedDirectories } from '~/application/services/workspace/named-directory.service.ts';

/* 名指されたディレクトリを、リポジトリ 1 つに読み替える。

   **どこを打っても同じリポジトリに着く**のがここの仕事である。リポジトリの下の作業
   ディレクトリを打っても、worktree を打っても、着く先は同じでなければならない ——
   着く先が打ち方で変わると、同じコマンドが日によって別のプロジェクトを開く。

   起動のときに打たれたパスと、走っている glasshive へあとから伝えられたパスの両方が
   ここに集まる。 */

const REPO = '/src/repo';

/** 尋ねられたサブコマンドで答えを引く偽の `git`。答えの無い問いは空の出力として返す */
function gitOf(answers: Record<string, string>): GitCommandIntegration {
  return {
    async run(request) {
      return observed(answers[`${request.cwd} ${request.args.join(' ')}`] ?? '');
    },
  };
}

const WORKTREES = ['worktree /src/repo', 'worktree /src/repo-wt', 'worktree /src/repo-old'].join(
  '\n',
);

describe('名指されたディレクトリの読み替え', () => {
  it('リポジトリの根まで登り、worktree を並べる', async () => {
    const directory = await createNamedDirectories({
      target: `${REPO}/apps/web`,
      git: gitOf({
        [`${REPO}/apps/web rev-parse --show-toplevel`]: `${REPO}\n`,
        [`${REPO} worktree list --porcelain`]: WORKTREES,
      }),
    }).launched();

    expect(directory?.requestedPath, '打った相手は控えておく。画面にはこちらを出す').toBe(
      `${REPO}/apps/web`,
    );
    expect(directory?.rootPath).toBe(REPO);
    expect(directory?.name).toBe('repo');
    expect(directory?.worktrees, '根そのものは worktree の一覧にも出るが、残りではない').toEqual([
      '/src/repo-wt',
      '/src/repo-old',
    ]);
  });

  /* Claude Code を走らせただけのディレクトリも観る相手になる。**リポジトリでないことは
     失敗ではない。** */
  it('リポジトリでなければ、打たれたパスがそのまま単位になる', async () => {
    const directory = await createNamedDirectories({
      target: '/tmp/notes',
      git: gitOf({}),
    }).launched();

    expect(directory?.rootPath).toBe('/tmp/notes');
    expect(directory?.name).toBe('notes');
    expect(directory?.worktrees).toEqual([]);
  });

  it('名指されていなければ、読み替える相手が無い', async () => {
    const directories = createNamedDirectories({ target: null, git: gitOf({}) });

    expect(await directories.launched()).toBe(null);
    expect(await directories.all()).toEqual([]);
  });

  /* `git` を起こせなかったのと、そこがリポジトリでないのは別である。前者を覚えると、
     一度きりの失敗のせいで worktree がこのウィンドウでは最後まで見えないままになる。 */
  it('`git` を起こせなかった答えは覚えない', async () => {
    let denied = true;
    const directories = createNamedDirectories({
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

    const blocked = await directories.launched();
    expect(blocked?.worktrees, '起こせなかった周では、worktree は 1 つも見えない').toEqual([]);

    denied = false;
    const answered = await directories.launched();
    expect(answered?.worktrees, '覚えたままだと、次に尋ねても見えないままになる').toEqual([
      '/src/x',
    ]);
  });

  /* 走っている glasshive は、あとから別のディレクトリを伝えられる。**伝えられた相手を
     覚えないと、一覧に載るのは起動のときの相手だけになる。** */
  it('あとから伝えられたディレクトリも覚える', async () => {
    let calls = 0;
    const directories = createNamedDirectories({
      target: REPO,
      git: {
        async run(request) {
          calls += 1;
          return observed(request.args[0] === 'rev-parse' ? `${request.cwd}\n` : '');
        },
      },
    });

    const first = await directories.name('/src/other');
    expect(first?.rootPath).toBe('/src/other');

    const asked = calls;
    await directories.name('/src/other');
    expect(calls, '一度答えが出たパスは、次に伝えられても `git` を起こし直さない').toBe(asked);

    expect(
      (await directories.all()).map((directory) => directory.rootPath).sort(),
      '起動のときの相手と、あとから伝えられた相手が両方並ぶ',
    ).toEqual(['/src/other', '/src/repo']);
  });

  /* 一覧を作るのは、誰かが尋ねに来るより先である。**起動のときの相手をここで確かめないと、
     名指されたディレクトリが一覧に載らないまま最初の画面が出る。** */
  it('一度も尋ねられていなくても、起動のときの相手は一覧に並ぶ', async () => {
    const directories = createNamedDirectories({ target: REPO, git: gitOf({}) });

    expect((await directories.all()).map((directory) => directory.rootPath)).toEqual([REPO]);
  });

  it('パスとして読めない文字列は名指しにならない', async () => {
    const directories = createNamedDirectories({ target: null, git: gitOf({}) });

    expect(await directories.name('src/repo'), '相対パスは、どこから見た相対かが分からない').toBe(
      null,
    );
    expect(await directories.name(''), '空の文字列はディレクトリを指していない').toBe(null);
    expect(await directories.all(), '断った相手は覚えない').toEqual([]);
  });
});
