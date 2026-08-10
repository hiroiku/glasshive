import { createServerFn } from '@tanstack/react-start';
import { getKernel } from '~/composition/kernel.ts';
import { readTree } from '~/interface/controllers/sessions/tree.controller.ts';

/* 木をブラウザーへ渡す server function。

   **この名前を `.server.ts` にしてはいけない。** 呼ぶのはブラウザー側なので、
   層の境界のガードが `*.server.*` を断ってしまう。中身はビルドのときに切り離され、
   ブラウザーへ渡るのは呼び出しのスタブだけになる。

   戻り値の型がそのまま呼ぶ側へ通るので、契約を手で書き写す必要が無い。
   書き写せば「片方だけ直して食い違う」事故が起きるが、ここではその余地が無い。 */

export const getTree = createServerFn({ method: 'GET' }).handler(() => readTree(getKernel().tree));
