import { useEffect, useState } from 'react';

/* もう載ったか。

   器(_shell.html)は組み立てのときに一度だけ描いて配る。そのとき描き手が居るのは
   一覧(`/`)であって、観る人が開いた道ではない。だから道に依るものを器に焼くと、
   別の道を直に開いた人の最初の描画と食い違い、React は継ぐのをやめて木を丸ごと作り直す。

   **器と、載る前の最初の描画を、同じものにする。** 道に依るものはここが false を返す間は
   出さず、載ってから言い直す。器も最初の描画も false なので、どの道から開いても揃う。 */

export function useHydrated(): boolean {
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => setHydrated(true), []);
  return hydrated;
}
