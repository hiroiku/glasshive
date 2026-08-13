import { createServerFn } from '@tanstack/react-start';
import { getKernel } from '~/composition/kernel.ts';
import {
  type PreferencesDeps,
  readPreferences,
  writePreferences,
} from '~/interface/controllers/workspace/preferences.controller.ts';

/* `preferences.json` をブラウザーとやり取りする server function。

   **この名前を `.server.ts` にしてはいけない。** 呼ぶのはブラウザー側なので、
   層の境界のガードが `*.server.*` を断ってしまう。 */

const deps = (): PreferencesDeps => {
  const kernel = getKernel();
  return {
    read: kernel.readPreferences,
    write: kernel.writePreferences,
    index: kernel.index,
    refresh: kernel.refresh,
  };
};

export const getPreferences = createServerFn({ method: 'GET' }).handler(() =>
  readPreferences(deps()),
);

/* 届いたものはそのまま `interface` 層へ渡す。

   **ここで文字列へ変換し直さない。** 循環参照や BigInt を渡されただけで投げることになり、
   届いた形が悪いだけで glasshive が壊れる。投げてよいのはプログラムの誤りだけである。
   何が読める入力なのかを決めるのは `interface` 層の仕事で、フレームワークは運ぶだけ。 */
export const setPreferences = createServerFn({ method: 'POST' })
  .validator((value: unknown) => value)
  .handler(({ data }) => writePreferences(deps(), data));
