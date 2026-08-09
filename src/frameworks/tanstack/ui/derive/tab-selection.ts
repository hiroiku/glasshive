import type { TabAction } from '~/interface/controllers/workspace/preferences.controller.ts';
import type { PreferencesJson } from '~/interface/presenters/workspace/preferences.presenter.ts';

/* 押した手応えを待たせないための、手元だけの組み替え。

   **これは覚え書きではない。** 本当の組み替えは向こう側が覚え書きを読み直してからする。
   ここでするのは、答えが返るまでの見た目を合わせることだけで、返ってきたら丸ごと入れ替わる。

   だから重複の始末や食い違いの解きまでは持たない。覚え書きの形を整えるのは向こうの仕事で、
   ここで真似ると同じ判断が二か所に散り、いつか片方だけ変わる。 */

export type TabSelectionJson = PreferencesJson['tab_selection'];

export function applyTabAction(selection: TabSelectionJson, action: TabAction): TabSelectionJson {
  if (action.action === 'pin') {
    // 既に留めてあれば順は変えない。留め直しで机の並びが動くと、押した意味が変わる
    if (selection.pinned.includes(action.id)) return selection;
    return {
      ...selection,
      pinned: [...selection.pinned, action.id],
      // 留めたほうが後の、強い申し出なので、伏せは解ける
      hidden: selection.hidden.filter((id) => id !== action.id),
    };
  }

  /* 外すのは机の上から下ろすことで、一覧から消すことではない。伏せるほうへは移さない */
  if (action.action === 'unpin') {
    return {
      ...selection,
      pinned: selection.pinned.filter((id) => id !== action.id),
    };
  }

  // 留めていない id は動かせない。ここで足すと、並べ替えが選びを増やすことになる
  if (!selection.pinned.includes(action.id)) return selection;
  const rest = selection.pinned.filter((id) => id !== action.id);
  const to = Math.min(Math.max(Math.trunc(action.toIndex), 0), rest.length);
  rest.splice(to, 0, action.id);
  return { ...selection, pinned: rest };
}
