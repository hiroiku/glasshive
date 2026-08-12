import { createServerFn } from '@tanstack/react-start';
import { getKernel } from '~/composition/kernel.ts';
import { readTarget } from '~/interface/controllers/workspace/target.controller.ts';

/* 起動のときに名指されたディレクトリを尋ねる server function。

   **この名前を `.server.ts` にしてはいけない。** 呼ぶのはブラウザー側なので、
   層の境界のガードが `*.server.*` を断ってしまう。

   引数を取らない。名指せるのは起動のときだけで、ここがパスを受け取ると、画面から
   任意のディレクトリを開けるようになる。 */

export const getTarget = createServerFn({ method: 'GET' }).handler(() =>
  readTarget({ target: getKernel().target }),
);
