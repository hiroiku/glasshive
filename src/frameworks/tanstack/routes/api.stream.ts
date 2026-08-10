import { createFileRoute } from '@tanstack/react-router';
import { getKernel } from '~/composition/kernel.ts';
import { openChangeStream } from '~/interface/controllers/sessions/change-stream.controller.ts';

/* 変更通知を配る SSE のルート。

   中身は controller にあり、ここは繋ぐだけである。もしバンドラーがこのルートの中身を
   ブラウザー側のバンドルから外し損ねたら、controller は層の境界のガードに引っかかって
   ビルドが落ちる — 人が目で確かめる代わりに、機械が毎回確かめる。

   なお、このルートにはリクエストのオリジンを確かめる仕掛けを付けない。`EventSource` は
   同じオリジンへの GET で `Origin` を送らないことがあり、付けると正しいクライアントまで
   断ってしまう。化けた宛先はランチャー(と開発中は Vite)が手前で断っている。 */

export const Route = createFileRoute('/api/stream')({
  server: {
    handlers: {
      GET: ({ request }) => openChangeStream(getKernel().changes, request.signal),
    },
  },
});
