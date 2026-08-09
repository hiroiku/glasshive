/* 記録 1 つぶんの見出しと、記録を短く指す字。

   sha を短くするのは画面の都合ではない。40 桁の字はどれも似て見えるので、
   人が見分けるための長さがここで決まる。 */

/** 短くした sha の桁数 */
export const SHORT_SHA_CHARS = 10;

/** 前後の空白を落として短くする。git の答えは行末の改行を伴う */
export const shortSha = (raw: string): string => raw.trim().slice(0, SHORT_SHA_CHARS);

/** 本流を何節まで遡るか */
export const MAINLINE_LIMIT = 120;

/** 本流に入っていない記録を何件まで並べるか */
export const UNIQUE_LOG_LIMIT = 40;

/** 本流に入っていない記録が無かったときに、代わりに並べる直近の件数 */
export const RECENT_LOG_LIMIT = 15;

/** 本流の 1 節。合流かどうかは親の数で決まる */
export interface MainlineCommit {
  readonly sha: string;
  /** 親が 2 つ以上あるか */
  readonly merge: boolean;
  readonly date: string;
  readonly subject: string;
}

/** 記録 1 つぶんの見出し */
export interface CommitSummary {
  readonly sha: string;
  readonly date: string;
  readonly author: string;
  readonly subject: string;
}
