/* 動いていた時間の帯。

   正本には 1 イベントごとの時刻しか無いので、帯は「近い時刻どうしを繋ぐ」ことで作る。
   繋ぐ幅を決めているのが `GAP_MS` で、これより長い無音は別の帯として分ける。 */

export interface ActivityInterval {
  readonly fromMs: number;
  readonly toMs: number;
}

export interface ActivityIntervalSet {
  readonly intervals: readonly ActivityInterval[];
  /** 正本の先頭まで読めたか。`false` なら、これより前にも帯が在り得る */
  readonly complete: boolean;
}

/** これ以上の無音が空いたら、別の帯として分ける */
export const GAP_MS = 120_000;

/* 帯がこの数を超えたら、繋ぐ幅を倍にして畳み直す。

   帯は 1 本ずつ描かれるので、数が多いと画面が潰れて何も読めなくなる。
   古い帯を捨てるのではなく粗くするのは、いつ動いていたかという全体の形を保つためである。 */
export const MAX_INTERVALS = 60;

export const EMPTY_ACTIVITY: ActivityIntervalSet = {
  intervals: [],
  complete: true,
};
