import { createServerFn } from '@tanstack/react-start';
import { getKernel } from '~/composition/kernel.ts';
import { readConversation } from '~/interface/controllers/sessions/conversation.controller.ts';

/* 会話 1 ページをブラウザーへ渡す server function。

   **この名前を `.server.ts` にしてはいけない。** 呼ぶのはブラウザー側なので、
   層の境界のガードが `*.server.*` を断ってしまう。

   届いたものはそのまま `interface` 層へ渡し、ここで文字列へ変換し直さない。
   何が読める問いなのかを決めるのは `interface` 層の仕事で、フレームワークは運ぶだけ。 */

export const getConversation = createServerFn({ method: 'GET' })
  .validator((value: unknown) => value)
  .handler(({ data }) => readConversation(getKernel().conversation, data));
