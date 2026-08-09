import type { ConflictForecast } from '~/domain/entities/git/git-overview.entity.ts';

/* 統合したときにぶつかる見込みを立てる。

   **実際に統合を試してはいない。** 試すには書き込む場所が要るし、この道具は何も書かない。
   代わりに「同じファイルを触っている線どうしはぶつかる公算が高い」という当てずっぽうを、
   触ったファイルの集合の重なりだけで出す。行が離れていればぶつからないので、これは
   ぶつかることの証拠ではなく、**先に統合する順を決めるための目印**である。

   組は多くても頭だけを見せる。全部を並べると、重なりの深い組が埋もれる。 */

/** 見せる組の数 */
export const MAX_CONFLICTS = 8;

/** 1 組につき挙げるファイルの本数 */
export const MAX_CONFLICT_FILES = 6;

/** 線 1 本が触ったファイル */
export interface TouchedFiles {
  readonly name: string;
  readonly files: ReadonlySet<string>;
}

export function forecastConflicts(touched: readonly TouchedFiles[]): ConflictForecast[] {
  const forecasts: ConflictForecast[] = [];
  for (let i = 0; i < touched.length && forecasts.length < MAX_CONFLICTS; i++) {
    const left = touched[i];
    if (left === undefined) continue;
    for (let j = i + 1; j < touched.length && forecasts.length < MAX_CONFLICTS; j++) {
      const right = touched[j];
      if (right === undefined) continue;
      const shared = [...left.files].filter((file) => right.files.has(file));
      if (shared.length === 0) continue;
      forecasts.push({
        a: left.name,
        b: right.name,
        count: shared.length,
        files: shared.slice(0, MAX_CONFLICT_FILES),
      });
    }
  }
  // 重なりの深い組から。深さが同じなら、線の並び(最後の記録が新しい順)のまま
  forecasts.sort((x, y) => y.count - x.count);
  return forecasts;
}
