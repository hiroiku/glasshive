/* コミット 1 つぶんのメタ情報と、コミットを短く指す文字列。

   sha を短くするのは画面の都合ではない。40 桁の sha はどれも似て見えるので、
   人が見分けるための長さがここで決まる。 */

/** 短くした sha の桁数 */
export const SHORT_SHA_CHARS = 10;

/** 前後の空白を落として短くする。`git` の出力は行末の改行を伴う */
export const shortSha = (raw: string): string => raw.trim().slice(0, SHORT_SHA_CHARS);

/** 本流を何コミットまで遡るか */
export const MAINLINE_LIMIT = 120;

/** 本流に入っていないコミットを何件まで並べるか */
export const UNIQUE_LOG_LIMIT = 40;

/** 本流に入っていないコミットが無かったときに、代わりに並べる直近の件数 */
export const RECENT_LOG_LIMIT = 15;

/** 本流の 1 コミット。合流かどうかは親の数で決まる */
export interface MainlineCommit {
  readonly sha: string;
  /** 親が 2 つ以上あるか */
  readonly merge: boolean;
  readonly date: string;
  readonly subject: string;
}

/** コミット 1 つぶんのメタ情報 */
export interface CommitSummary {
  readonly sha: string;
  readonly date: string;
  readonly author: string;
  readonly subject: string;
}
