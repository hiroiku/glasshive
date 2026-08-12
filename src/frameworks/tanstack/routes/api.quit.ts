import { createFileRoute } from '@tanstack/react-router';
import { fromCommandLine } from '~/frameworks/node/cli-request.ts';
import { NotCommandLineError } from '~/interface/errors/workspace/open-directory.error.ts';
import { presentError } from '~/interface/presenters/api-error.presenter.ts';

/* 走っている glasshive を終わらせるルート。

   サーバーを 1 つに保つと決めた以上、**終わらせ方も 1 つでなければならない** —— どの
   ターミナルが持っているかを覚えていないと止められない、では入口と出口が釣り合わない。

   **ブラウザーからは終わらせられない。** 名指しと同じ決まりで、コマンドラインからの求め
   だけを通す。開いているページが観ている当のサーバーを落とせては困る。

   答えを返してから終わる。ここで即座に終わると、伝えに来たコマンドは接続を切られた側
   として「止まったかどうか分からない」を受け取る。 */

/** 答えを書き終えるまでの猶予。**待ちではない** —— 返事が相手に届くまで生きているための間である */
const GOODBYE_MS = 50;

export const Route = createFileRoute('/api/quit')({
  server: {
    handlers: {
      POST: ({ request }) => {
        if (!fromCommandLine(request.headers)) {
          const refused = presentError(
            new NotCommandLineError('Only the command line can stop glasshive'),
          );
          return Response.json(refused.body, {
            status: refused.status,
            headers: { 'cache-control': 'no-store' },
          });
        }

        setTimeout(() => process.exit(0), GOODBYE_MS);
        return Response.json({ pid: process.pid }, { headers: { 'cache-control': 'no-store' } });
      },
    },
  },
});
