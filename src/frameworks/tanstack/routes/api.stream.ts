import { createFileRoute } from '@tanstack/react-router';
import { getKernel } from '~/composition/kernel.ts';
import { openChangeStream } from '~/interface/controllers/sessions/change-stream.controller.ts';

/* 合図を配る道。

   中身は controller にあり、ここは繋ぐだけである。もし束ね役がこの道の中身を
   ブラウザー側の束から外し損ねたら、controller は境目の見張りに引っかかって
   組み立てが落ちる — 人が目で確かめる代わりに、機械が毎回確かめる。

   なお、この道には求めの出所を確かめる仕掛けを付けない。EventSource は同じ出所への
   GET で Origin を送らないことがあり、付けると正しい窓まで断ってしまう。
   化けた宛先は起動口(と開発中は Vite)が手前で断っている。 */

export const Route = createFileRoute('/api/stream')({
  server: {
    handlers: {
      GET: ({ request }) => openChangeStream(getKernel().changes, request.signal),
    },
  },
});
