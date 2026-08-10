import { createServerFn } from '@tanstack/react-start';
import { systemClock } from '~/app-kernel/clock.ts';
import { getKernel } from '~/composition/kernel.ts';
import { searchTranscripts } from '~/interface/controllers/sessions/search.controller.ts';
import { readUsage } from '~/interface/controllers/sessions/usage.controller.ts';

/* トークンの消費と `transcript` の検索をブラウザーへ渡す server function。

   **この名前を `.server.ts` にしてはいけない。** 呼ぶのはブラウザー側なので、
   層の境界のガードが `*.server.*` を断ってしまう。 */

export const getUsage = createServerFn({ method: 'GET' })
  .validator((value: unknown) => value)
  .handler(({ data }) => readUsage({ useCase: getKernel().usage, clock: systemClock }, data));

export const findTranscripts = createServerFn({ method: 'GET' })
  .validator((value: unknown) => value)
  .handler(({ data }) =>
    searchTranscripts({ useCase: getKernel().search, clock: systemClock }, data),
  );
