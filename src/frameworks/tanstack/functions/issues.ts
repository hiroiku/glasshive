import { createServerFn } from '@tanstack/react-start';
import { getKernel } from '~/composition/kernel.ts';
import {
  type GithubIssuesDeps,
  type IssuesDeps,
  getGithubIssueBody as readGithubIssueBody,
  listGithubIssues as readGithubIssues,
  getIssue as readIssue,
  listIssues as readIssues,
} from '~/interface/controllers/issues/issues.controller.ts';

/* 課題をブラウザーへ渡す server function。

   **この名前を `.server.ts` にしてはいけない。** 呼ぶのはブラウザー側なので、
   層の境界のガードが `*.server.*` を断ってしまう。 */

const deps = (): IssuesDeps => {
  const kernel = getKernel();
  return { list: kernel.listIssues, get: kernel.getIssue, index: kernel.index };
};

export const getIssues = createServerFn({ method: 'GET' })
  .validator((value: unknown) => value)
  .handler(({ data }) => readIssues(deps(), data));

export const getIssue = createServerFn({ method: 'GET' })
  .validator((value: unknown) => value)
  .handler(({ data }) => readIssue(deps(), data));

const githubDeps = (): GithubIssuesDeps => {
  const kernel = getKernel();
  return { list: kernel.listGithubIssues, body: kernel.githubIssueBody, index: kernel.index };
};

export const getGithubIssues = createServerFn({ method: 'GET' })
  .validator((value: unknown) => value)
  .handler(({ data }) => readGithubIssues(githubDeps(), data));

/* 開いた 1 件の本文。**一覧とは別に叩く。** 一覧に本文を混ぜると、100 件ぶんを運ぶことになる */
export const getGithubIssueBody = createServerFn({ method: 'GET' })
  .validator((value: unknown) => value)
  .handler(({ data }) => readGithubIssueBody(githubDeps(), data));
