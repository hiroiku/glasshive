import { createServerFn } from '@tanstack/react-start';
import { getKernel } from '~/composition/kernel.ts';
import {
  type PreferencesDeps,
  readPreferences,
  writePreferences,
} from '~/interface/controllers/workspace/preferences.controller.ts';

/* 選びをブラウザーと遣り取りする口。

   **この名前を `.server.ts` にしてはいけない。** 呼ぶのはブラウザー側なので、
   境目の見張りが `*.server.*` を断ってしまう。 */

const deps = (): PreferencesDeps => {
  const kernel = getKernel();
  return {
    read: kernel.readPreferences,
    write: kernel.writePreferences,
    tree: kernel.tree,
  };
};

export const getPreferences = createServerFn({ method: 'GET' }).handler(() =>
  readPreferences(deps()),
);

/* 届いたものはそのまま窓へ渡す。

   **ここで字に落とし直さない。** 輪になった値や BigInt を渡されただけで投げることになり、
   届いた形が悪いだけで道具が壊れる。**投げるのはプログラムの誤りだけ**である。
   何が読める申し出なのかを決めるのは窓(interface)の仕事で、枠組みは運ぶだけ。 */
export const setPreferences = createServerFn({ method: 'POST' })
  .inputValidator((value: unknown) => value)
  .handler(({ data }) => writePreferences(deps(), data));
