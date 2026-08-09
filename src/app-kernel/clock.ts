/* いまを訊く口。

   旧実装が `scan(source, scope, procs, nowMs)` と、いまを引数で受けていたのは良い性質だった —
   稼働かどうかの判定は「いま」に懸かっているので、これを内側で読むと、検査は待たされるか
   ファイルの時刻を細工することになる。その性質を口として引き継ぐ。 */

export interface Clock {
  /** epoch ミリ秒 */
  now(): number;
}

export const systemClock: Clock = { now: () => Date.now() };

/** 検査用。時を止める */
export const fixedClock = (ms: number): Clock => ({ now: () => ms });
