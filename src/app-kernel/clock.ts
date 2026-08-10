/* いまを訊くインターフェース。

   稼働かどうかの判定は「いま」に懸かっている。導出の内側で `Date.now()` を直に読むと、
   テストは待たされるかファイルの時刻を細工することになるので、「いま」は必ず
   ここから受け取る。 */

export interface Clock {
  /** epoch ミリ秒 */
  now(): number;
}

export const systemClock: Clock = { now: () => Date.now() };

/** テスト用。時刻を固定する */
export const fixedClock = (ms: number): Clock => ({ now: () => ms });
