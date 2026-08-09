import { createServerFn } from '@tanstack/react-start';
import { getKernel } from '~/composition/kernel.ts';
import {
  type IssuesDeps,
  getIssue as readIssue,
  listIssues as readIssues,
} from '~/interface/controllers/issues/issues.controller.ts';

/* 課題をブラウザーへ渡す口。

   **この名前を `.server.ts` にしてはいけない。** 呼ぶのはブラウザー側なので、
   境目の見張りが `*.server.*` を断ってしまう。 */

const deps = (): IssuesDeps => {
  const kernel = getKernel();
  return { list: kernel.listIssues, get: kernel.getIssue, tree: kernel.tree };
};

export const getIssues = createServerFn({ method: 'GET' })
  .inputValidator((value: unknown) => value)
  .handler(({ data }) => readIssues(deps(), data));

export const getIssue = createServerFn({ method: 'GET' })
  .inputValidator((value: unknown) => value)
  .handler(({ data }) => readIssue(deps(), data));
