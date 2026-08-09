import { createFileRoute, redirect } from '@tanstack/react-router';

/* 巣を開いたら、まず誰が動いているかを見せる。

   送り先を持たせるのは、`/projects/<巣>` そのものに中身を持たせないためである。
   持たせると「どのビューでもない状態」が生まれ、下の帯のどれも光らない画面ができる。 */

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
