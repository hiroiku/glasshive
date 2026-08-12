import { createFileRoute } from '@tanstack/react-router';
import { getKernel } from '~/composition/kernel.ts';
import { fromCommandLine } from '~/frameworks/node/cli-request.ts';
import { openDirectory } from '~/interface/controllers/workspace/target.controller.ts';

/* すでに走っている glasshive へ、開きたいディレクトリを伝えるルート。

   中身は controller にあり、ここは繋ぐだけである。server function ではなくルートにして
   あるのは、**呼ぶのがブラウザーではなくコマンドだから**である —— server function の
   宛先は生成された id で、外のプロセスからは名指せない。

   コマンドから来たかどうかの見分けは、伝えに来る側と同じファイルに置いてある
   (`cli-request.ts`)。離すと、片方だけ名前が変わった日に glasshive が自分自身の求めを断る。 */

export const Route = createFileRoute('/api/open')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        /* 読めない本文は、読めない求めとして controller が断る。ここで投げると、
           形の違いだけでサーバーが 500 を返すことになる。 */
        const body = await request.json().catch(() => null);
        const answer = await openDirectory(
          { target: getKernel().target },
          {
            path: (body as { path?: unknown } | null)?.path,
            fromCommandLine: fromCommandLine(request.headers),
          },
        );
        return Response.json(answer.body, {
          status: answer.ok ? 200 : answer.status,
          headers: { 'cache-control': 'no-store' },
        });
      },
    },
  },
});
