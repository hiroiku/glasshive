import { valueOr } from '~/app-kernel/observation.ts';
import type { ViewerPreferencesRepository } from '~/application/ports/repositories/workspace/viewer-preferences.repository.ts';
import {
  documentOf,
  localeOf,
  watchedOf,
} from '~/application/services/workspace/preferences-document.service.ts';
import { reconcile, watch } from '~/domain/services/workspace/watched-projects.service.ts';
import { DEFAULT_WATCHED_PROJECTS } from '~/domain/value-objects/workspace/watched-projects.value-object.ts';

/* コマンドラインが名指したディレクトリを、観ると決めたものとして記録する。

   **名指すことは、観ると決めることである。** 記録しないと、開いた相手はそのとき限りの
   ものになり、次に読み込んだ画面から消える。

   ここだけはパスを受け取る。**受け取ってよいのはコマンドラインからの求めだけである** ——
   画面からパスを名指せると、開いているどのページも任意のディレクトリを glasshive に
   読ませられる。見分けるのは求めが届いた側で、ここへは見分けた結果だけが来る。 */

export interface WatchDirectoryUseCase {
  /** 記録する。足したなら `true`。すでに在る・置けなかったときは `false` */
  execute(path: string): Promise<boolean>;
}

export function createWatchDirectory(deps: {
  readonly preferences: ViewerPreferencesRepository;
}): WatchDirectoryUseCase {
  return {
    async execute(path) {
      const document = await deps.preferences.load();
      const stored = watchedOf(document);
      /* **読めなかったときは置かない。** 倒したコピーに足して置けば、その推測がそのまま
         保存され、記録してあったものが本当に消える。 */
      if (stored.kind === 'unobservable') return false;

      const current = reconcile(valueOr(stored, DEFAULT_WATCHED_PROJECTS));
      const next = watch(current, path);
      // すでに記録して在る。置き直すと、並びを変えていないのに更新時刻だけが動く
      if (next.paths.length === current.paths.length) return false;

      /* 書いてよいかの判定に、いま名指されたディレクトリを渡す。**観測元の中には書かない** ——
         保存先がそのプロジェクトのデータディレクトリの中を指していれば、ここで断られる。 */
      const saved = await deps.preferences.save(
        documentOf(next, valueOr(localeOf(document), null)),
        { observedRoots: [path] },
      );
      /* 置けなかったことを投げない。**記録できなくても観測は続く** —— 開く先は今までどおり
         答えられて、次に読み込んだときに一覧から消えるだけである。 */
      return saved.ok;
    },
  };
}
