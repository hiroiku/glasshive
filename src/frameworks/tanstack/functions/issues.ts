import { createServerFn } from '@tanstack/react-start';
import { getKernel } from '~/composition/kernel.ts';
import {
  type GithubIssuesDeps,
  getGithubIssueBody as readGithubIssueBody,
  getGithubIssueDiscussion as readGithubIssueDiscussion,
  listGithubIssues as readGithubIssues,
} from '~/interface/controllers/issues/issues.controller.ts';

/* 課題をブラウザーへ渡す server function。

   **この名前を `.server.ts` にしてはいけない。** 呼ぶのはブラウザー側なので、
   層の境界のガードが `*.server.*` を断ってしまう。 */

const githubDeps = (): GithubIssuesDeps => {
  const kernel = getKernel();
  return {
    list: kernel.listGithubIssues,
    body: kernel.githubIssueBody,
    discussion: kernel.githubIssueDiscussion,
    index: kernel.index,
  };
};

export const getGithubIssues = createServerFn({ method: 'GET' })
  .validator((value: unknown) => value)
  .handler(({ data }) => readGithubIssues(githubDeps(), data));

/* 開いた 1 件の本文。**一覧とは別に叩く。** 一覧に本文を混ぜると、100 件ぶんを運ぶことになる */
export const getGithubIssueBody = createServerFn({ method: 'GET' })
  .validator((value: unknown) => value)
  .handler(({ data }) => readGithubIssueBody(githubDeps(), data));

/* 開いた 1 件のやり取り。**本文とも別に叩く。** やり取りは何ページにもなることがあり、
   本文と一緒に運ぶと、本文だけを見たい人まで全ページぶんを待つことになる。 */
export const getGithubIssueDiscussion = createServerFn({ method: 'GET' })
  .validator((value: unknown) => value)
  .handler(({ data }) => readGithubIssueDiscussion(githubDeps(), data));
