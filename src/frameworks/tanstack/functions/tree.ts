import { createServerFn } from '@tanstack/react-start';
import { getKernel } from '~/composition/kernel.ts';
import { readTree, streamTree } from '~/interface/controllers/sessions/tree.controller.ts';

/* 木をブラウザーへ渡す server function。

   **この名前を `.server.ts` にしてはいけない。** 呼ぶのはブラウザー側なので、
   層の境界のガードが `*.server.*` を断ってしまう。中身はビルドのときに切り離され、
   ブラウザーへ渡るのは呼び出しのスタブだけになる。

   戻り値の型がそのまま呼ぶ側へ通るので、契約を手で書き写す必要が無い。
   書き写せば「片方だけ直して食い違う」事故が起きるが、ここではその余地が無い。 */

export const getTree = createServerFn({ method: 'GET' }).handler(() => readTree(getKernel().tree));

/* 木を、読めたところから順に渡す server function。

   **`async function*` を返すだけでよい。** 同期的に書き切れない値は、フレーム化した本文へ
   自動で切り替わる。応答のストリームそれ自体が、この呼び出しとの結び付きである —
   だから相関の id も、宛先を選ぶ仕掛けも要らない。

   新しい route を作らないのは、そうするとルートの木を作り直すことになり、
   CSRF の対象からも外れるからである。 */
export const getTreeStream = createServerFn({ method: 'GET' }).handler(() =>
  streamTree(getKernel().tree),
);
