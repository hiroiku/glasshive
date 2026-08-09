import { createServerFn } from '@tanstack/react-start';
import { systemClock } from '~/app-kernel/clock.ts';
import { getKernel } from '~/composition/kernel.ts';
import { searchTranscripts } from '~/interface/controllers/sessions/search.controller.ts';
import { readUsage } from '~/interface/controllers/sessions/usage.controller.ts';

/* 消費と探しをブラウザーへ渡す口。

   **この名前を `.server.ts` にしてはいけない。** 呼ぶのはブラウザー側なので、
   境目の見張りが `*.server.*` を断ってしまう。 */

export const getUsage = createServerFn({ method: 'GET' })
  .inputValidator((value: unknown) => value)
  .handler(({ data }) => readUsage({ useCase: getKernel().usage, clock: systemClock }, data));

export const findTranscripts = createServerFn({ method: 'GET' })
  .inputValidator((value: unknown) => value)
  .handler(({ data }) =>
    searchTranscripts({ useCase: getKernel().search, clock: systemClock }, data),
  );
