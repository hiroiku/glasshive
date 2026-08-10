import type { Observation } from '~/app-kernel/observation.ts';
import type {
  PreferencesView,
  TabSelection,
} from '~/application/use-cases/workspace/read-preferences.use-case.ts';

/* タブの選択を、外部 API が読む形へ写す。

   写すだけである。並べ替えも絞りもここではしない — どちらも導出の仕事で、
   ここでやると同じ判断が二か所に散る。

   見るのは use-case が出した形だけである。内側の名前を直に覗くと、
   内側を組み替えたときに外へ出す形まで一緒に動いてしまう。 */

export interface TabSelectionJson {
  version: 1;
  mode: 'all' | 'pinned';
  pinned: string[];
  hidden: string[];
}

/** `preferences.json` をどう読めたか。`Observation` の三つの状態と同じ文字列を使う */
export interface StoredStatusJson {
  state: 'observed' | 'absent' | 'unobservable';
  /** 観測できなかった理由。観測できたときは理由が無いので `null` */
  reason: string | null;
}

export interface PreferencesJson {
  /** 保存されているタブの選択そのもの。一覧から消えた id もここには残る */
  tab_selection: TabSelectionJson;
  /* タブに出す id。**`tab_selection.pinned` のコピーではない。**
     観測していない id は出ないので、両方を出さないと
     「ピン留めしてあるのにタブが無い」理由が受け取る側から見えなくなる。 */
  visible_tabs: string[];
  /* `preferences.json` を読めたか。既定へ倒れたとき、無かったのか観測できなかったのかを分ける。
     どちらも「ピン留めが無い」ように見えるので、この欄でしか見分けられない。 */
  stored: StoredStatusJson;
}

const reasonOf = <T>(observation: Observation<T>): string | null => {
  if (observation.kind === 'absent') return observation.reason;
  if (observation.kind === 'unobservable') return observation.error.code;
  return null;
};

const presentSelection = (selection: TabSelection): TabSelectionJson => ({
  version: selection.version,
  mode: selection.mode,
  pinned: [...selection.pinned],
  hidden: [...selection.hidden],
});

export function presentPreferences(view: PreferencesView): PreferencesJson {
  return {
    tab_selection: presentSelection(view.selection),
    visible_tabs: [...view.visibleTabs],
    stored: { state: view.stored.kind, reason: reasonOf(view.stored) },
  };
}
