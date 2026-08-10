import { createServerFn } from '@tanstack/react-start';
import { getKernel } from '~/composition/kernel.ts';
import { readMessages } from '~/interface/controllers/sessions/messages.controller.ts';

/* エージェント間メッセージをブラウザーへ渡す server function。

   **この名前を `.server.ts` にしてはいけない。** 呼ぶのはブラウザー側なので、
   層の境界のガードが `*.server.*` を断ってしまう。 */

export const getMessages = createServerFn({ method: 'GET' })
  .validator((value: unknown) => value)
  .handler(({ data }) => readMessages({ useCase: getKernel().messages }, data));
