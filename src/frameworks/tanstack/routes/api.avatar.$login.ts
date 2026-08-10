import { createFileRoute } from '@tanstack/react-router';
import { getKernel } from '~/composition/kernel.ts';
import { readAvatar } from '~/interface/controllers/issues/avatar.controller.ts';

/* 顔 1 枚を返すルート。

   中身は controller にあり、ここは繋ぐだけである。`<img src>` が引く先なので、
   server function ではなくルートにしてある —— `<img>` は URL しか引けない。

   このルートにもリクエストのオリジンを確かめる仕掛けは付けない。`<img>` の求めは
   同じオリジンへの GET で、化けた宛先はランチャー(と開発中は Vite)が手前で断っている。 */

export const Route = createFileRoute('/api/avatar/$login')({
  server: {
    handlers: {
      GET: ({ params, request }) =>
        readAvatar(getKernel().avatars, params.login, request.headers.get('if-none-match')),
    },
  },
});
