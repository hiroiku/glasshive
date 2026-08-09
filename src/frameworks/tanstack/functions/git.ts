import { createServerFn } from '@tanstack/react-start';
import { getKernel } from '~/composition/kernel.ts';
import {
  type GitDeps,
  readGitOverview,
  readGitRef,
} from '~/interface/controllers/git/git.controller.ts';

/* 記録をブラウザーへ渡す口。

   **この名前を `.server.ts` にしてはいけない。** 呼ぶのはブラウザー側なので、
   境目の見張りが `*.server.*` を断ってしまう。 */

const deps = (): GitDeps => {
  const kernel = getKernel();
  return { overview: kernel.gitOverview, ref: kernel.gitRef, tree: kernel.tree };
};

export const getGit = createServerFn({ method: 'GET' })
  .inputValidator((value: unknown) => value)
  .handler(({ data }) => readGitOverview(deps(), data));

export const getGitRef = createServerFn({ method: 'GET' })
  .inputValidator((value: unknown) => value)
  .handler(({ data }) => readGitRef(deps(), data));
