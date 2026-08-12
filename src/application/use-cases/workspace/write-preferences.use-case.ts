import { observed, valueOr } from '~/app-kernel/observation.ts';
import { err, ok, type Result } from '~/app-kernel/result.ts';
import { ProjectNotObservedError } from '~/application/errors/sessions/not-observed.error.ts';
import type { ViewerPreferencesRepository } from '~/application/ports/repositories/workspace/viewer-preferences.repository.ts';
import {
  documentOf,
  localeOf,
  watchedOf,
} from '~/application/services/workspace/preferences-document.service.ts';
import type {
  PreferencesInput,
  PreferencesView,
} from '~/application/use-cases/workspace/read-preferences.use-case.ts';
import {
  move,
  reconcile,
  unwatch,
  visibleTabs,
  watch,
} from '~/domain/services/workspace/watched-projects.service.ts';
import type { Locale } from '~/domain/value-objects/workspace/locale.value-object.ts';
import {
  DEFAULT_WATCHED_PROJECTS,
  type WatchedProjects,
} from '~/domain/value-objects/workspace/watched-projects.value-object.ts';

/* 観ると決めたものを組み替える。

   **受けるのは「何をしたいか」ひとつだけである。** 丸ごとの記録を受けて置き換えると、
   求める側が読んでから置くまでの間に別のクライアントが足したぶんが、黙って消える。
   読む・当てる・置くをここで 1 つの処理に閉じてあるので、その隙が無い。

   受け取るのは id で、覚えておくのはパスである。**ブラウザーはパスを名指せない** ——
   名指せると、開いているどのページも任意のディレクトリを glasshive に読ませられる。
   id からパスへ読み替えるのは、こちらが見つけたものの中だけである。 */

/** 記録への操作。観る・やめる・並べ替えの 3 つだけで、丸ごとの差し替えは受けない */
export type TabAction =
  | { readonly action: 'watch'; readonly id: string }
  | { readonly action: 'unwatch'; readonly id: string }
  | { readonly action: 'move'; readonly id: string; readonly toIndex: number };

/* 画面の言葉を選ぶ操作。**`null` は英語ではなく「選ぶのをやめる」である** ——
   選び直せる先が無いと、一度選んだ人はブラウザーの言葉へ戻れなくなる。 */
export type LocaleAction = { readonly action: 'locale'; readonly locale: Locale | null };

export type PreferenceAction = TabAction | LocaleAction;

export interface WritePreferencesInput extends PreferencesInput {
  readonly action: PreferenceAction;
  /** いま観測しているプロジェクトのパス。**ここへは書かない**ことを確かめるために渡す */
  readonly observedRoots: readonly string[];
}

export interface WritePreferencesUseCase {
  execute(input: WritePreferencesInput): Promise<Result<PreferencesView>>;
}

/* 落とす先を、タブ行の位置から記録の位置へ読み替える。

   **押した人が見ているのはタブ行である。** 記録には観測できていない場所も残っているので、
   行の位置をそのまま記録の位置として使うと、観測できない場所が 1 つ在るだけで落とした先が
   ずれる。行の上で「この id の手前」と読み、その id のパスが記録の何番目かを見る。 */
function storedIndexOf(
  current: WatchedProjects,
  rows: PreferencesInput['observed'],
  moved: string,
  toIndex: number,
): number {
  const path = (id: string): string | undefined => rows.find((row) => row.id === id)?.path;
  const rest = current.paths.filter((kept) => kept !== path(moved));
  const before = visibleTabs(current, rows).filter((id) => id !== moved)[Math.trunc(toIndex)];
  const beforePath = before === undefined ? undefined : path(before);
  const at = beforePath === undefined ? -1 : rest.indexOf(beforePath);
  return at < 0 ? rest.length : at;
}

export function createWritePreferences(deps: {
  readonly preferences: ViewerPreferencesRepository;
}): WritePreferencesUseCase {
  return {
    async execute({ action, observed: rows, known, observedRoots }) {
      /* 当てる相手は、いま置いてある `preferences.json` である。求める側が持っている
         コピーではない。コピーに当てて丸ごと置くと、そのコピーを取った後に別のクライアントが
         足したぶんが消える。 */
      const document = await deps.preferences.load();
      const stored = watchedOf(document, known);

      /* **読めなかったときは置かない。** 読む側は既定へ倒してよい — 倒しても観測は 1 つも
         欠けず、記録が「まだ何も観ていない」に見えるだけで、次に読めたときには戻る。置く側は
         違う。倒したコピーに操作を載せて置けば、その推測がそのまま保存され、記録して
         あったものが本当に消える。一時的に読めなかっただけで、観ると決めた一覧を丸ごと
         捨てることになる。 */
      if (stored.kind === 'unobservable') return err(stored.error);

      /* 無いのと、読める形になっていないのは倒してよい。捨てると決めてあるので、
         倒しても失うものが無い。 */
      const current = reconcile(valueOr(stored, DEFAULT_WATCHED_PROJECTS));

      /* id からパスへ読み替える。**引けない id は断る** —— 黙って何もしないと、押した人には
         「効かないボタン」としか見えない。 */
      let next: WatchedProjects = current;
      if (action.action !== 'locale') {
        const path = [...known, ...rows].find((project) => project.id === action.id)?.path;
        if (path === undefined) {
          return err(new ProjectNotObservedError(`no project is observed as ${action.id}`));
        }
        next =
          action.action === 'watch'
            ? watch(current, path)
            : action.action === 'unwatch'
              ? unwatch(current, path)
              : move(current, path, storedIndexOf(current, rows, action.id, action.toIndex));
      }

      /* 触っていないほうを書き戻す。**片方の操作でもう片方を落とさない** ——
         足すたびに選んだ言葉が消えると、選び直したのに戻ったように見える。 */
      const locale = action.action === 'locale' ? action.locale : valueOr(localeOf(document), null);

      const saved = await deps.preferences.save(documentOf(next, locale), { observedRoots });
      // 断られた・置けなかったときは、置けた振りをしない。古い `preferences.json` はそのまま残っている
      if (!saved.ok) return err(saved.error);
      return ok({
        watched: next,
        visibleTabs: visibleTabs(next, rows),
        locale,
        // いま置いたものが、そのまま `preferences.json` の中身である
        stored: observed(next),
      });
    },
  };
}
