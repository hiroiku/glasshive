import { describe, expect, it } from 'vitest';
import { AppError } from '~/app-kernel/error.ts';
import { err, ok } from '~/app-kernel/result.ts';
import { openDirectory, readTarget } from '~/interface/controllers/workspace/target.controller.ts';

/* 走っている glasshive へ、開きたいディレクトリを伝える入口。

   **ディレクトリを名指せるのはコマンドラインだけである。** 画面から名指せると、開いている
   どのページも任意のディレクトリを glasshive に読ませられる。 */

/** 索引を起こせなかったときのエラー。観測できなかった側のエラーコードを使う */
class IndexError extends AppError {
  readonly code = 'transcript.unreadable';
}

type Deps = Parameters<typeof openDirectory>[0];
type Target = Extract<Awaited<ReturnType<Deps['target']['execute']>>, { ok: true }>['value'];

const REPO: NonNullable<Target> = {
  requestedPath: '/src/repo/apps/web',
  rootPath: '/src/repo',
  name: 'repo',
  projectId: 'the-repo',
  siblings: [],
};

/** 尋ねられたパスを控える偽の相手。**尋ねられなかったことも見たい** */
function targetOf(answer: Target | AppError) {
  const asked: (string | null | undefined)[] = [];
  const deps: Deps = {
    target: {
      async execute(path) {
        asked.push(path);
        return answer instanceof AppError ? err(answer) : ok(answer);
      },
    },
  };
  return { deps, asked };
}

describe('開きたいディレクトリを伝える', () => {
  it('開く先の URL を答える', async () => {
    const { deps, asked } = targetOf(REPO);

    const answer = await openDirectory(deps, { path: '/src/repo/apps/web', fromCommandLine: true });

    expect(answer.ok).toBe(true);
    if (!answer.ok) return;
    expect(
      answer.body.url,
      '1 つだけ開いている枠で出す。伝えに来た側は id も枠の出し方も知らない',
    ).toBe('/projects/the-repo/work?only=true');
    expect(asked, '起動のときの相手ではなく、伝えられたパスを見る').toEqual(['/src/repo/apps/web']);
  });

  /* 名指した場所に何も観測できていなくても断らない。**それは失敗ではない。** */
  it('開くプロジェクトが決まらなければ、Overview を開く先にする', async () => {
    const { deps } = targetOf({ ...REPO, projectId: null });

    const answer = await openDirectory(deps, { path: '/src/fresh', fromCommandLine: true });

    expect(answer.ok).toBe(true);
    if (!answer.ok) return;
    expect(answer.body.url).toBe('/');
  });

  it('コマンドライン以外から名指されたら断る', async () => {
    const { deps, asked } = targetOf(REPO);

    const answer = await openDirectory(deps, { path: '/etc', fromCommandLine: false });

    expect(answer.ok).toBe(false);
    if (answer.ok) return;
    expect(answer.status, '求め方の誤りではなく、その求め手には許されていない').toBe(403);
    expect(answer.body.code).toBe('workspace.not_command_line');
    expect(asked, '断る求めで観測を動かすと、名指せないはずの場所を尋ねに行ったことになる').toEqual(
      [],
    );
  });

  it('ディレクトリを名指していない求めは断る', async () => {
    const { deps } = targetOf(REPO);

    for (const path of [undefined, '', 42, ['/src/repo']]) {
      const answer = await openDirectory(deps, { path, fromCommandLine: true });

      expect(answer.ok, `${JSON.stringify(path)} はディレクトリを指していない`).toBe(false);
      if (answer.ok) continue;
      expect(answer.status).toBe(400);
      expect(answer.body.code).toBe('workspace.invalid_path');
    }
  });

  /* 伝えに来たのはコマンドで、通ったかどうかで次にすることが変わる。**投げない。** */
  it('観測できなかったことは、値で返す', async () => {
    const { deps } = targetOf(new IndexError('索引を起こせない'));

    const answer = await openDirectory(deps, { path: '/src/repo', fromCommandLine: true });

    expect(answer.ok).toBe(false);
    if (answer.ok) return;
    expect(answer.status).toBe(503);
    expect(answer.body.state).toBe('unobservable');
  });
});

describe('起動のときに名指された相手を読む', () => {
  it('パスを渡さずに尋ねる', async () => {
    const { deps, asked } = targetOf(REPO);

    const answer = await readTarget(deps);

    expect(answer?.project_id).toBe('the-repo');
    expect(asked, '画面が尋ねるほうは、ディレクトリを名指せない').toEqual([undefined]);
  });

  it('観測できなかったら投げる', async () => {
    const { deps } = targetOf(new IndexError('索引を起こせない'));

    await expect(readTarget(deps)).rejects.toBeInstanceOf(IndexError);
  });
});
