/* どこまで読むかの線引き。

   正本は追記され続けるので、全部を読む設計にすると大きなセッション 1 つで観測が止まる。
   だから読む量に上限を置き、上限に当たったことは値として持ち帰る(`complete: false`、
   `absent('out-of-window')`)。**読んでいないだけで、無いのではない**。

   値をここに集めてあるのは、読む側(infrastructure)と、読めた範囲を語る側(domain)が
   同じ数を見るためである。 */

/** セッションの正本の先頭から読む量。題・作業場所・起点はここに在る */
export const HEAD_BYTES = 256 * 1024;

/** セッションの正本の末尾から読む量。枝・モデル・いま何をしているかはここに在る */
export const TAIL_BYTES = 128 * 1024;

/** 子の正本の先頭から読む量 */
export const SUB_HEAD_BYTES = 64 * 1024;

/** 子の正本の末尾から読む量。稼働している子だけ読む */
export const SUB_TAIL_BYTES = 64 * 1024;

/** 稼働区間を拾うために末尾から読む量 */
export const INTERVAL_SCAN_BYTES = 4 * 1024 * 1024;

/** トークンの数えのために末尾から読む量 */
export const USAGE_SCAN_BYTES = 8 * 1024 * 1024;

/** 探しのために末尾から読む量 */
export const SEARCH_TAIL_BYTES = 1024 * 1024;

/* 探しで返す正本の数の上限。**開いた数ではなく、当たった数を数える。**
   ここまで当たったら、残りは見に行かずに打ち切る。 */
export const SEARCH_MAX_FILES = 200;

/** これより短い語では探さない。短すぎる語は全部に当たって意味を成さない */
export const SEARCH_MIN_QUERY_CHARS = 2;

/** これより古い正本のトークンは数えない。数えるには全体を読む必要があり、割に合わない */
export const TOKEN_AGE_MS = 7 * 86_400_000;

/** 統計と探しが遡る範囲 */
export const STATS_WINDOW_MS = 7 * 86_400_000;

/* 一覧の「直近の消費」が遡る範囲。

   `TOKEN_AGE_MS` の内側に収めてある。外へ広げると、数えるために開かなかった正本を
   窓に含めることになり、静かな巣と読まなかった巣が同じ 0 で並ぶ。 */
export const RECENT_WINDOW_MS = 86_400_000;
