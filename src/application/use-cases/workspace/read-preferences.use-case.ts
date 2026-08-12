import { type Observation, valueOr } from '~/app-kernel/observation.ts';
import type { ViewerPreferencesRepository } from '~/application/ports/repositories/workspace/viewer-preferences.repository.ts';
import {
  localeOf,
  watchedOf,
} from '~/application/services/workspace/preferences-document.service.ts';
import { reconcile, visibleTabs } from '~/domain/services/workspace/watched-projects.service.ts';
import type { Locale } from '~/domain/value-objects/workspace/locale.value-object.ts';
import {
  DEFAULT_WATCHED_PROJECTS,
  type WatchedProjects,
} from '~/domain/value-objects/workspace/watched-projects.value-object.ts';

/* `preferences.json` を読み、いま観測しているものと突き合わせる。

   **記録の一覧は `preferences.json` のコピーではない。** 一覧を作るたびにここで
   突き合わせて立てる。だから `preferences.json` が読めないときには記録が
   「まだ何も観ていない」に倒れ、観測は 1 つも欠けない。 */

/* 出す形。**外部 API へ写す側は、この名前だけを見る。** 内側の名前をそのまま覗かせると、
   内側を組み替えるたびに外の形まで引きずられる。

   画面に出せる言葉の一覧はここから渡さない。渡すのは `~/application/i18n/locale.ts` で、
   そちらはブラウザーへ届く側も引く。 */
export type { ObservedProjectRef } from '~/domain/services/workspace/watched-projects.service.ts';
export type { WatchedProjects };

export interface PreferencesInput {
  /** いま観測できているプロジェクト。タブに出す対象を決める */
  readonly observed: readonly { readonly id: string; readonly path: string }[];
  /* 見つけただけのものも含めて、id からパスを引ける全部。**1 つ前の形からの引き継ぎに要る**
     —— 留めてあったのは id で、パスは観測の側にしか無い。 */
  readonly known: readonly { readonly id: string; readonly path: string }[];
}

export interface PreferencesView {
  /** `preferences.json` を整えた、いま使う記録。観測できていない場所もここには残る */
  readonly watched: WatchedProjects;
  /** タブに出す id。観測に在るものだけが、記録した順に並ぶ */
  readonly visibleTabs: readonly string[];
  /* 選ばれた画面の言葉。**まだ選んでいなければ `null` である。**
     `en` に倒して返すと、選んでいない人の画面がブラウザーの言葉を見に行けなくなる。 */
  readonly locale: Locale | null;
  /* `preferences.json` をどう読めたか。既定へ倒れたとき、なぜ倒れたのかをユーザーへ
     伝えるために持つ。無かったのか観測できなかったのかが分からないと、記録が消えた
     理由を尋ねようがない。 */
  readonly stored: Observation<WatchedProjects>;
}

export interface ReadPreferencesUseCase {
  execute(input: PreferencesInput): Promise<PreferencesView>;
}

export function createReadPreferences(deps: {
  readonly preferences: ViewerPreferencesRepository;
}): ReadPreferencesUseCase {
  return {
    async execute({ observed, known }) {
      const document = await deps.preferences.load();
      const stored = watchedOf(document, known);
      /* 読めなかった理由をここで潰す。潰してよいのは、**`preferences.json` が壊れても
         観測は止まらない**と決めてあるからである。理由そのものは `stored` に残して外へ渡す。 */
      const watched = reconcile(valueOr(stored, DEFAULT_WATCHED_PROJECTS));
      return {
        watched,
        visibleTabs: visibleTabs(watched, observed),
        locale: valueOr(localeOf(document), null),
        stored,
      };
    },
  };
}
