import { type Observation, valueOr } from '~/app-kernel/observation.ts';
import type { ViewerPreferencesRepository } from '~/application/ports/repositories/workspace/viewer-preferences.repository.ts';
import { selectionOf } from '~/application/services/workspace/preferences-document.service.ts';
import { reconcile, visibleTabs } from '~/domain/services/workspace/tab-selection.service.ts';
import {
  DEFAULT_TAB_SELECTION,
  type TabSelection,
} from '~/domain/value-objects/workspace/tab-selection.value-object.ts';

/* 覚え書きを読み、いま観測しているものと突き合わせる。

   **留めた印は覚え書きの写しではない。** 一覧を作るたびにここで突き合わせて立てる。
   だから覚え書きが読めない日には印が「留めていない」に倒れ、観測は 1 つも欠けない。 */

/* 出す選びの形。**外の道へ写す側はこの名前だけを見る。**
   内側の名前をそのまま覗かせると、内側を組み替えるたびに外の形まで引きずられる。 */
export type { TabSelection };

export interface PreferencesView {
  /** 覚え書きと観測を突き合わせた、いま使う選び。消えた id もここには残る */
  readonly selection: TabSelection;
  /** タブに出す id。観測に在るものだけが並ぶ */
  readonly visibleTabs: readonly string[];
  /* 覚え書きをどう読めたか。既定へ倒れたとき、なぜ倒れたのかを観る人へ伝えるために持つ。
     無かったのか読めなかったのかが分からないと、選びが消えた理由を尋ねようがない。 */
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
      const stored = selectionOf(await deps.preferences.load());
      /* 見えなかった理由をここで潰す。潰してよいのは、**覚え書きが壊れても観測は止まらない**
         と決めてあるからである。理由そのものは `stored` に残して外へ渡す。 */
      const selection = reconcile(valueOr(stored, DEFAULT_TAB_SELECTION));
      return {
        selection,
        visibleTabs: visibleTabs(selection, observedIds),
        stored,
      };
    },
  };
}
