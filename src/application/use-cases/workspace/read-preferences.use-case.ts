import { type Observation, valueOr } from '~/app-kernel/observation.ts';
import type { ViewerPreferencesRepository } from '~/application/ports/repositories/workspace/viewer-preferences.repository.ts';
import {
  localeOf,
  selectionOf,
} from '~/application/services/workspace/preferences-document.service.ts';
import { reconcile, visibleTabs } from '~/domain/services/workspace/tab-selection.service.ts';
import type { Locale } from '~/domain/value-objects/workspace/locale.value-object.ts';
import {
  DEFAULT_TAB_SELECTION,
  type TabSelection,
} from '~/domain/value-objects/workspace/tab-selection.value-object.ts';

/* `preferences.json` を読み、いま観測しているものと突き合わせる。

   **ピン留めの一覧は `preferences.json` のコピーではない。** 一覧を作るたびにここで
   突き合わせて立てる。だから `preferences.json` が読めないときにはピン留めが
   「留めていない」に倒れ、観測は 1 つも欠けない。 */

/* 出す形。**外部 API へ写す側と、カタログを選ぶ側は、この名前だけを見る。**
   内側の名前をそのまま覗かせると、内側を組み替えるたびに外の形まで引きずられる。

   `LOCALES` を値のまま通してあるのは、出せる言葉の一覧が 1 箇所にしか無いためである。
   写す側が自分の一覧を持つと、言葉を足した日にどちらかが取り残される。 */
export {
  DEFAULT_LOCALE,
  isLocale,
  LOCALES,
  type Locale,
} from '~/domain/value-objects/workspace/locale.value-object.ts';
export type { TabSelection };

export interface PreferencesView {
  /** `preferences.json` と観測を突き合わせた、いま使うタブの選択。消えた id もここには残る */
  readonly selection: TabSelection;
  /** タブに出す id。観測に在るものだけが並ぶ */
  readonly visibleTabs: readonly string[];
  /* 選ばれた画面の言葉。**まだ選んでいなければ `null` である。**
     `en` に倒して返すと、選んでいない人の画面がブラウザーの言葉を見に行けなくなる。 */
  readonly locale: Locale | null;
  /* `preferences.json` をどう読めたか。既定へ倒れたとき、なぜ倒れたのかをユーザーへ
     伝えるために持つ。無かったのか観測できなかったのかが分からないと、選択が消えた
     理由を尋ねようがない。 */
  readonly stored: Observation<TabSelection>;
}

export interface ReadPreferencesUseCase {
  execute(observedIds: readonly string[]): Promise<PreferencesView>;
}

export function createReadPreferences(deps: {
  readonly preferences: ViewerPreferencesRepository;
}): ReadPreferencesUseCase {
  return {
    async execute(observedIds) {
      const document = await deps.preferences.load();
      const stored = selectionOf(document);
      /* 読めなかった理由をここで潰す。潰してよいのは、**`preferences.json` が壊れても
         観測は止まらない**と決めてあるからである。理由そのものは `stored` に残して外へ渡す。 */
      const selection = reconcile(valueOr(stored, DEFAULT_TAB_SELECTION));
      return {
        selection,
        visibleTabs: visibleTabs(selection, observedIds),
        locale: valueOr(localeOf(document), null),
        stored,
      };
    },
  };
}
