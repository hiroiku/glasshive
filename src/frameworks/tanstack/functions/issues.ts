import { createServerFn } from '@tanstack/react-start';
import { getKernel } from '~/composition/kernel.ts';
import {
  type GithubIssuesDeps,
  getGithubIssueBody as readGithubIssueBody,
  getGithubIssueDiscussion as readGithubIssueDiscussion,
  getGithubIssueEvents as readGithubIssueEvents,
  listGithubIssues as readGithubIssues,
  streamGithubIssueEvents as walkGithubIssueEvents,
  streamGithubIssues as walkGithubIssues,
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
    events: kernel.githubIssueEvents,
    index: kernel.index,
  };
};

export const getGithubIssues = createServerFn({ method: 'GET' })
  .validator((value: unknown) => value)
  .handler(({ data }) => readGithubIssues(githubDeps(), data));

/* 課題を、読めたページから順に渡す server function。

   **`async function*` を返すだけでよい。** 同期的に書き切れない値は、フレーム化した本文へ
   自動で切り替わる。応答のストリームそれ自体がこの呼び出しとの結び付きなので、相関の id も、
   宛先を選ぶ仕掛けも要らない。 */
export const getGithubIssuesStream = createServerFn({ method: 'GET' })
  .validator((value: unknown) => value)
  .handler(({ data }) => walkGithubIssues(githubDeps(), data));

/* 開いた 1 件の本文。**一覧とは別に叩く。** 一覧に本文を混ぜると、100 件ぶんを運ぶことになる */
export const getGithubIssueBody = createServerFn({ method: 'GET' })
  .validator((value: unknown) => value)
  .handler(({ data }) => readGithubIssueBody(githubDeps(), data));

/* 開いた 1 件のやり取り。**本文とも別に叩く。** やり取りは何ページにもなることがあり、
   本文と一緒に運ぶと、本文だけを見たい人まで全ページぶんを待つことになる。 */
export const getGithubIssueDiscussion = createServerFn({ method: 'GET' })
  .validator((value: unknown) => value)
  .handler(({ data }) => readGithubIssueDiscussion(githubDeps(), data));

/* 一覧に出ている課題に起きたこと。**一覧とも別に叩く。** 同じ問い合わせに混ぜると、
   Work の画面が開くまでが倍になる —— 一覧は一覧の速さで開き、点は返ってきたときに埋まる。 */
export const getGithubIssueEvents = createServerFn({ method: 'GET' })
  .validator((value: unknown) => value)
  .handler(({ data }) => readGithubIssueEvents(githubDeps(), data));

/* 記録も、読めたページから順に渡す。一覧と同じ形である */
export const getGithubIssueEventsStream = createServerFn({ method: 'GET' })
  .validator((value: unknown) => value)
  .handler(({ data }) => walkGithubIssueEvents(githubDeps(), data));
