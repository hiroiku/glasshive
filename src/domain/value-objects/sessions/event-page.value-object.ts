/* 会話を送るときの、バイト単位の位置と上限。

   会話のページ送りだけは行の数ではなくバイトの位置で進む。追記され続ける `transcript` を
   同じ場所から読み直せる手掛かりは、バイトの位置しか無いからである。

   `next` が進まないことが、書き込み途中の行を消費しなかった証になる。 */

export interface EventPageCursor {
  /** 実際に読み始めた位置。行の頭に揃えた後の値 */
  readonly start: number;
  /** 次に読むべき位置。不完全な末尾行はここに含めない */
  readonly next: number;
  readonly eof: boolean;
  readonly size: number;
}

/** 位置を指定せずに求められたとき、末尾から読む量 */
export const TAIL_WINDOW_BYTES = 256 * 1024;

/** 一度の呼び出しで読み進むバイト数の上限 */
export const MAX_CHUNK_BYTES = 2 * 1024 * 1024;

/** 行を探して読み進める単位 */
export const READ_BLOCK_BYTES = 256 * 1024;

/** 一度の呼び出しで返すイベントの数の上限 */
export const MAX_EVENTS = 500;

/** 1 つのブロックで運ぶ文字数の上限 */
export const MAX_TEXT_CHARS = 50_000;

/** 切り詰めたことを示す文字列 */
export const TRUNCATION_NOTICE = '\n… (truncated)';
