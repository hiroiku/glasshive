/* 差分の姿。何本のファイルが、どれだけ増えて、どれだけ減ったか。

   一覧は動きの大きい順に頭だけを見せる。全部を並べても目で追えないからである。
   **数え上げは切り詰める前に済ませる。** 切り詰めた後で数えると、6 本より多く触った
   差分がどれも「6 本」に見える。 */

/** 一覧に載せるファイルの本数 */
export const MAX_DIFF_FILES = 6;

/** ファイル 1 本ぶんの増減 */
export interface DiffFileStat {
  readonly path: string;
  readonly add: number;
  readonly del: number;
}

/** 差分ぜんぶの数え上げ */
export interface DiffStat {
  readonly files: number;
  readonly add: number;
  readonly del: number;
}

export interface DiffSummary {
  /** 触ったファイルが 1 本も無ければ無い */
  readonly stat: DiffStat | null;
  /** 動きの大きい順の頭 */
  readonly files: readonly DiffFileStat[];
}

const movement = (file: DiffFileStat): number => file.add + file.del;

export function summarizeDiff(rows: readonly DiffFileStat[]): DiffSummary {
  if (rows.length === 0) return { stat: null, files: [] };
  let add = 0;
  let del = 0;
  for (const row of rows) {
    add += row.add;
    del += row.del;
  }
  const files = [...rows].sort((x, y) => movement(y) - movement(x)).slice(0, MAX_DIFF_FILES);
  return { stat: { files: rows.length, add, del }, files };
}
