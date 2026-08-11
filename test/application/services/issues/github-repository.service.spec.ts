import { describe, expect, it } from 'vitest';
import { AppError } from '~/app-kernel/error.ts';
import { observed, unobservable } from '~/app-kernel/observation.ts';
import type { GitCommandIntegration } from '~/application/ports/integrations/git/git-command.integration.ts';
import { locateGithubRepository } from '~/application/services/issues/github-repository.service.ts';

/* 課題をどのリポジトリに尋ねるか。

   選び方そのものは `gh` に合わせてある —— 同じディレクトリで `gh issue list` が出すものと
   画面が食い違わないことが先に来る。ここで確かめるのは、**選んだことを黙らないか**である。
   remote を 2 つ持つプロジェクトで黙って 1 つ選ぶと、選ばれなかったリポジトリの課題は
   画面から消え、読んだ人にはそれが「無い」としか見えない。 */

class GitMissing extends AppError {
  readonly code = 'git.not_installed';
}

const gitWithConfig = (...lines: readonly string[]): GitCommandIntegration => ({
  async run() {
    return observed(lines.join('\n'));
  },
});

const locate = (git: GitCommandIntegration) => locateGithubRepository(git, '/nest/project');

describe('課題を尋ねる先を決める', () => {
  it('remote が 1 つなら、選んでいない', async () => {
    const found = await locate(gitWithConfig('remote.origin.url git@github.com:hiroiku/glasshive'));

    expect(found.kind === 'observed' && found.value.repository).toEqual({
      owner: 'hiroiku',
      name: 'glasshive',
    });
    expect(found.kind === 'observed' && found.value.others).toBe(0);
  });

  it('GitHub を指す remote が 2 つあれば、選ばなかった数を言う', async () => {
    const found = await locate(
      gitWithConfig(
        'remote.origin.url git@github.com:hiroiku/glasshive',
        'remote.upstream.url https://github.com/kuden-world/kuden-drive.git',
      ),
    );

    expect(
      found.kind === 'observed' && found.value.repository.name,
      '選び方は `gh` に合わせたまま変えない',
    ).toBe('kuden-drive');
    expect(found.kind === 'observed' && found.value.others).toBe(1);
  });

  /* `origin` と `github` が同じ場所を指している設定は珍しくない。2 つと数えると、
     選ぶ余地の無いところで「どちらを見ているのか」という迷いだけを作ることになる。 */
  it('同じ場所を指す remote を 2 つと数えない', async () => {
    const found = await locate(
      gitWithConfig(
        'remote.origin.url git@github.com:hiroiku/glasshive',
        'remote.github.url https://github.com/hiroiku/glasshive.git',
      ),
    );

    expect(found.kind === 'observed' && found.value.others).toBe(0);
  });

  it('綴りの大小が違うだけの remote も、同じ場所として数える', async () => {
    const found = await locate(
      gitWithConfig(
        'remote.origin.url git@github.com:hiroiku/glasshive',
        'remote.github.url https://github.com/Hiroiku/GlassHive.git',
      ),
    );

    expect(found.kind === 'observed' && found.value.others).toBe(0);
  });

  /* `gh repo set-default` を打ってあれば、決めたのはユーザーである。
     こちらは選んでいないので、他に何本あっても断る理由が無い。 */
  it('`gh-resolved` で決まっていれば、選んだことにしない', async () => {
    const found = await locate(
      gitWithConfig(
        'remote.origin.url git@github.com:hiroiku/glasshive',
        'remote.origin.gh-resolved base',
        'remote.upstream.url https://github.com/kuden-world/kuden-drive.git',
      ),
    );

    expect(found.kind === 'observed' && found.value.repository.name).toBe('glasshive');
    expect(found.kind === 'observed' && found.value.others).toBe(0);
  });

  it('GitHub を指していない remote は数に入れない', async () => {
    const found = await locate(
      gitWithConfig(
        'remote.origin.url git@github.com:hiroiku/glasshive',
        'remote.mirror.url git@gitlab.com:hiroiku/glasshive.git',
      ),
    );

    expect(found.kind === 'observed' && found.value.others).toBe(0);
  });

  it('GitHub を指す remote が 1 つも無ければ、尋ね先が無いと言う', async () => {
    const found = await locate(gitWithConfig('remote.origin.url git@gitlab.com:hiroiku/other.git'));

    expect(found.kind === 'absent' && found.reason).toBe('no-source');
  });

  /* remote を持たないリポジトリで `git config --get-regexp` は非ゼロで終わる。
     これを観測できなかったことにすると、ほとんどのプロジェクトが赤い画面になる。 */
  it('`git` を起こせなかったことは、尋ね先が無いことに倒す', async () => {
    const found = await locate({
      async run() {
        return unobservable(new GitMissing('git が無い'));
      },
    });

    expect(found.kind).toBe('absent');
  });
});
