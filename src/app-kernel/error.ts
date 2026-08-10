/* エラーの基底クラス。

   glasshive では、**観測の結果は値で返し、投げるのはプログラムの誤りだけ** と決めている。
   ファイルが無い・リポジトリでない・権限が無い、はどれも起こって当たり前のことで、
   投げて止めるようなものではない(`observation.ts` を参照)。

   ここに置くのは「起きたら直すべきこと」と、外へ伝えるための機械可読なエラーコードだけである。 */

export abstract class AppError extends Error {
  /** `'git.not_installed'` のような、バージョンを跨いで変わらないエラーコード。UI とテストはこれを見る */
  abstract readonly code: string;

  readonly details: Readonly<Record<string, unknown>> | undefined;

  constructor(message: string, options?: { cause?: unknown; details?: Record<string, unknown> }) {
    super(message, options?.cause !== undefined ? { cause: options.cause } : undefined);
    this.name = new.target.name;
    this.details = options?.details;
  }
}

/** 説明の付かないエラー。ここに落ちてくるものは、たいてい直すべき穴である */
export class UnexpectedError extends AppError {
  readonly code = 'unexpected';
}

export const isAppError = (e: unknown): e is AppError => e instanceof AppError;

/** 投げられた何かを `AppError` に正規化する。`infrastructure` の境界でだけ使う */
export const asAppError = (e: unknown): AppError =>
  isAppError(e)
    ? e
    : new UnexpectedError(e instanceof Error ? e.message : String(e), {
        cause: e,
      });
