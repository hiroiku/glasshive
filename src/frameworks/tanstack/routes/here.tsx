import { createFileRoute, redirect } from '@tanstack/react-router';
import { targetQuery } from '../queries/target.query.ts';

/* 起動のときに名指されたディレクトリを開く入口。

   ランチャーはここを開く。**id を組み立てるのはランチャーの仕事ではない** —— どの
   プロジェクトを指すかを決めるのは索引と `git` で、ランチャーはその答えを知らない。

   ここに留まる画面は無い。答えが出た時点でプロジェクトの URL へ置き換わるので、
   読み込み直しても戻るボタンでも、ここへ戻ってくることはない。待っているあいだに
   出るのはルーターの待ちの画面で、そこには索引の進み具合が出ている。

   名指されていない glasshive でこの URL を直に開くこともできる。そのときに開くのは Overview で、
   断りは出さない —— 名指されていないことは誤りではない。 */

export const Route = createFileRoute('/here')({
  loader: async ({ context }) => {
    const target = await context.queryClient.ensureQueryData(targetQuery);
    if (target === null || target.project_id === null) throw redirect({ to: '/', replace: true });
    /* 着くのは Work である。issue とブランチは `transcript` が 1 本も無くても読めるので、
       まだ Claude Code を走らせていないリポジトリでも、開いた画面に中身が在る。 */
    throw redirect({
      to: '/projects/$slug/work',
      params: { slug: target.project_id },
      search: { only: true },
      replace: true,
    });
  },
});
