import { useEffect, useState } from 'react';

/* もうハイドレートされたか。

   HTML シェル(`_shell.html`)はビルド時に一度だけ描いて配る。そのとき描き手が居るのは
   一覧(`/`)であって、ユーザーが開いたルートではない。だからルートに依るものを
   HTML シェルに焼くと、別のルートを直に開いた人の最初の描画と食い違い、React は継ぐのを
   やめて木を丸ごと作り直す。

   **HTML シェルと、ハイドレート前の最初の描画を、同じものにする。** ルートに依るものは
   ここが false を返す間は出さず、ハイドレートしてから言い直す。HTML シェルも最初の描画も
   false なので、どのルートから開いても揃う。 */

export function useHydrated(): boolean {
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => setHydrated(true), []);
  return hydrated;
}
