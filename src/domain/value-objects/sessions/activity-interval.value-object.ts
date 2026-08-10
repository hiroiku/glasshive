/* 動いていた稼働区間。

   `transcript` には 1 イベントごとの時刻しか無いので、区間は「近い時刻どうしを繋ぐ」ことで
   作る。繋ぐ幅を決めているのが `GAP_MS` で、これより長い無音は別の区間として分ける。 */

export interface ActivityInterval {
  readonly fromMs: number;
  readonly toMs: number;
}

export interface ActivityIntervalSet {
  readonly intervals: readonly ActivityInterval[];
  /** `transcript` の先頭まで読めたか。`false` なら、これより前にも区間が在り得る */
  readonly complete: boolean;
}

/** これ以上の無音が空いたら、別の区間として分ける */
export const GAP_MS = 120_000;

/* 区間がこの数を超えたら、繋ぐ幅を倍にしてまとめ直す。

   区間は 1 本ずつ描かれるので、数が多いと画面が潰れて何も読めなくなる。
   古い区間を捨てるのではなく粗くするのは、いつ動いていたかという全体の形を保つためである。 */
export const MAX_INTERVALS = 60;

export const EMPTY_ACTIVITY: ActivityIntervalSet = {
  intervals: [],
  complete: true,
};
