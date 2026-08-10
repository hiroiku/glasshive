import { createServerFn } from '@tanstack/react-start';
import { getKernel } from '~/composition/kernel.ts';
import {
  type GitDeps,
  readGitOverview,
  readGitRef,
} from '~/interface/controllers/git/git.controller.ts';

/* `git` の観測をブラウザーへ渡す server function。

   **この名前を `.server.ts` にしてはいけない。** 呼ぶのはブラウザー側なので、
   層の境界のガードが `*.server.*` を断ってしまう。 */

const deps = (): GitDeps => {
  const kernel = getKernel();
  return { overview: kernel.gitOverview, ref: kernel.gitRef, index: kernel.index };
};

export const getGit = createServerFn({ method: 'GET' })
  .validator((value: unknown) => value)
  .handler(({ data }) => readGitOverview(deps(), data));

export const getGitRef = createServerFn({ method: 'GET' })
  .validator((value: unknown) => value)
  .handler(({ data }) => readGitRef(deps(), data));
