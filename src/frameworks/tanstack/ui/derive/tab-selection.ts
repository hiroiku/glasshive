import type { TabAction } from '~/interface/controllers/workspace/preferences.controller.ts';

/* 押した手応えを待たせないための、クライアント側だけの組み替え。

   **これは `preferences.json` ではない。** 本当の組み替えは向こう側が `preferences.json`
   を読み直してからする。ここでするのは、結果が返るまでの見た目を合わせることだけで、
   返ってきたら丸ごと入れ替わる。

   組み替えるのはタブに並ぶ id である。記録そのものは絶対パスで持たれていて、こちらは
   その読み替えを知らない —— **知らないままでよい。** 押した相手の id は分かっているので、
   見た目を合わせるにはそれで足りる。

   だから重複の始末までは持たない。`preferences.json` の形を整えるのは向こうの仕事で、
   ここで真似ると同じ判断が二か所に散り、いつか片方だけ変わる。 */

export function applyTabAction(tabs: readonly string[], action: TabAction): readonly string[] {
  if (action.action === 'watch') {
    // 既に観ていれば順は変えない。押し直しでタブの並びが動くと、押した意味が変わる
    return tabs.includes(action.id) ? tabs : [...tabs, action.id];
  }

  if (action.action === 'unwatch') return tabs.filter((id) => id !== action.id);

  // 観ていない id は動かせない。ここで足すと、並べ替えが記録を増やすことになる
  if (!tabs.includes(action.id)) return tabs;
  const rest = tabs.filter((id) => id !== action.id);
  const to = Math.min(Math.max(Math.trunc(action.toIndex), 0), rest.length);
  rest.splice(to, 0, action.id);
  return rest;
}
