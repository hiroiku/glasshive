import type { ConflictForecast } from '~/domain/entities/git/git-overview.entity.ts';

/* ぶつかる見込みを覚えておく。

   見込みを立てるには先端の数だけ差分を起こす。先端が 18 個あれば 18 回で、しかも画面は
   繰り返し尋ねてくる。分かれ目から先が動いていなければ結果は変わらないので、
   それを決める文字列をキーにして前の結果をそのまま返す。

   **キーには本流の名だけでなく、本流の sha も入れる。** 見込みは分かれ目からの差分で立てるので、
   本流が先端のコミットを取り込むと、先端が 1 つも動かないまま重なりが消える。名前だけをキーに
   すると、そこで消えたはずの見込みを見せ続けることになる。

   プロジェクトごとに 1 つだけ覚える — 古いキーの結果は、もう誰も尋ねない。 */

export interface ConflictCacheService {
  get(project: string, key: string): readonly ConflictForecast[] | undefined;
  set(project: string, key: string, forecasts: readonly ConflictForecast[]): void;
}

export const conflictCacheKey = (
  base: string,
  baseSha: string,
  tipShas: readonly string[],
): string => `${base}@${baseSha}|${tipShas.join(',')}`;

export function createConflictCache(): ConflictCacheService {
  const byProject = new Map<string, { key: string; forecasts: readonly ConflictForecast[] }>();
  return {
    get(project, key) {
      const entry = byProject.get(project);
      return entry?.key === key ? entry.forecasts : undefined;
    },
    set(project, key, forecasts) {
      byProject.set(project, { key, forecasts });
    },
  };
}
