import { createServerFn } from '@tanstack/react-start';
import { getKernel } from '~/composition/kernel.ts';
import { readConversation } from '~/interface/controllers/sessions/conversation.controller.ts';

/* 会話 1 頁をブラウザーへ渡す口。

   **この名前を `.server.ts` にしてはいけない。** 呼ぶのはブラウザー側なので、
   境目の見張りが `*.server.*` を断ってしまう。

   届いたものはそのまま窓へ渡す。**ここで字に落とし直さない** —
   何が読める問いなのかを決めるのは窓の仕事で、枠組みは運ぶだけ。 */

export const getConversation = createServerFn({ method: 'GET' })
  .inputValidator((value: unknown) => value)
  .handler(({ data }) => readConversation(getKernel().conversation, data));
