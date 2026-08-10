/* チップにホバーしたら、本文の側の同じものを光らせる。

   会話の中の `glasshive-2dt` と、表の中のその課題を扱っている行は、同じものを指している。
   目で追わせるかわりに、ホバーした瞬間に両方を光らせる。

   **React の状態にしない。** 光らせる相手は別の画面の別の木に散っていて、
   親子の関係が無い。状態に載せると、チップ 1 つにホバーするたびに両方の木を描き直す
   ことになる — 数百行の表で毎フレーム走る値ではない。 */

/** 空白で区切った完全一致で引く属性。行が自分の持ち物を並べる */
const TOKEN_ATTRIBUTE = 'data-tok';

/** 部分一致で引く属性。Git の行のように、名前の一部しか持たないもの */
const NAME_ATTRIBUTE = 'data-name';

export function hoverTok(token: string, on: boolean): void {
  for (const element of document.querySelectorAll(`[${TOKEN_ATTRIBUTE}]`)) {
    const hit = (element.getAttribute(TOKEN_ATTRIBUTE) ?? '').split(' ').includes(token);
    element.classList.toggle('tok-hl', on && hit);
  }
  for (const element of document.querySelectorAll(`[${NAME_ATTRIBUTE}]`)) {
    const hit = (element.getAttribute(NAME_ATTRIBUTE) ?? '').includes(token);
    element.classList.toggle('tok-hl', on && hit);
  }
}
