import { createServerFn } from '@tanstack/react-start';
import { getKernel } from '~/composition/kernel.ts';
import { readTree } from '~/interface/controllers/sessions/tree.controller.ts';

/* 木をブラウザーへ渡す口。

   **この名前を `.server.ts` にしてはいけない。** 呼ぶのはブラウザー側なので、
   境目の見張りが `*.server.*` を断ってしまう。中身は組み立てのときに切り離され、
   ブラウザーへ渡るのは呼び出しの殻だけになる。

   戻り値の型がそのまま呼ぶ側へ通るので、契約を手で書き写す必要が無い。
   手で書き写していたころに絶えなかった「片方だけ直して食い違う」事故が、ここで消える。 */

export const getTree = createServerFn({ method: 'GET' }).handler(() => readTree(getKernel().tree));
