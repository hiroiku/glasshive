import { samePath } from '~/app-kernel/path.ts';
import {
  WATCHED_PROJECTS_VERSION,
  type WatchedProjects,
} from '~/domain/value-objects/workspace/watched-projects.value-object.ts';

/* 記録を組み替える。ここは純粋で、ディスクにも時計にも触らない。

   **「覚えておく」ことと「出す」ことを分けてある。** 覚えておくのは人が決めたパスで、
   タブに出すのはそのうち いま観測できているものだけ。混ぜると、記録が観測を作り出す
   経路ができてしまう。 */

/** 観測できているプロジェクト 1 つ。id とパスの対応だけを見る */
export interface ObservedProjectRef {
  readonly id: string;
  readonly path: string;
}

/** 重複を落とす。残すのは先に出てきたほうなので、並びの順は変わらない */
function dedupe(paths: readonly string[]): string[] {
  const kept: string[] = [];
  for (const path of paths) {
    if (path === '' || kept.some((seen) => samePath(seen, path))) continue;
    kept.push(path);
  }
  return kept;
}

const of = (paths: readonly string[]): WatchedProjects => ({
  version: WATCHED_PROJECTS_VERSION,
  paths,
});

/* 形を整えるだけ。重複を落とし、順を保つ。

   **観測を受け取らない。** 受け取れば、いつか誰かがそれで削る。観測に合わせて削ると、
   `~/.claude/projects` をひととき読めなかっただけの日に記録が丸ごと消える —— ここは純粋で、
   空の一覧が「無かった」のか「観測できなかった」のかを知らない。観測は、出す対象を決める
   `visibleTabs` の側でだけ効かせる。 */
export const reconcile = (watched: WatchedProjects): WatchedProjects => of(dedupe(watched.paths));

/* タブに出す id。**観測に在るものだけが並ぶ。**

   記録に在っても観測できていないパスは出さない。出すと、消えた worktree を指すタブが残り、
   押しても何も無い画面が開く。記録そのものは `reconcile` の側に残る。

   並ぶ順は記録の順である。観測の側の順に従うと、人が並べ替えたタブが読み込みのたびに
   入れ替わる。 */
export function visibleTabs(
  watched: WatchedProjects,
  observed: readonly ObservedProjectRef[],
): readonly string[] {
  const ids: string[] = [];
  for (const path of dedupe(watched.paths)) {
    const found = observed.find((project) => samePath(project.path, path));
    if (found !== undefined && !ids.includes(found.id)) ids.push(found.id);
  }
  return ids;
}

/** 観ると決める。既に記録して在れば順は変えない */
export const watch = (watched: WatchedProjects, path: string): WatchedProjects =>
  of(dedupe([...watched.paths, path]));

/* 観るのをやめる。**一覧からも消える** —— 記録とタブは同じ 1 つの並びなので、
   外したものが一覧にだけ残ることはない。もう一度観たくなったら、Overview から選び直す。 */
export const unwatch = (watched: WatchedProjects, path: string): WatchedProjects =>
  of(dedupe(watched.paths).filter((kept) => !samePath(kept, path)));

/* 並びを変える。落とす先が端をはみ出したら端で丸める。

   **記録していないものは動かせない。** ここで足すと、並べ替えという操作が記録を増やす
   ことになる。 */
export function move(watched: WatchedProjects, path: string, toIndex: number): WatchedProjects {
  if (!Number.isFinite(toIndex)) return watched;
  const paths = dedupe(watched.paths);
  if (!paths.some((kept) => samePath(kept, path))) return watched;
  const rest = paths.filter((kept) => !samePath(kept, path));
  const to = Math.min(Math.max(Math.trunc(toIndex), 0), rest.length);
  rest.splice(to, 0, path);
  return of(rest);
}
