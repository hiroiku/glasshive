import { createFileRoute, redirect } from '@tanstack/react-router';

/* プロジェクトを開いたら、まず誰が動いているかを見せる。

   リダイレクトを置くのは、`/projects/$slug` そのものに中身を持たせないためである。
   持たせると「どのビューでもない状態」が生まれ、サブバーのどれも光らない画面ができる。 */

export const Route = createFileRoute('/projects/$slug/')({
  beforeLoad: ({ params, search }) => {
    throw redirect({
      to: '/projects/$slug/agents',
      params,
      search,
      replace: true,
    });
  },
});
