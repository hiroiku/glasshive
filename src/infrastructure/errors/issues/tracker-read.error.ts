import { AppError } from '~/app-kernel/error.ts';
import type { TrackerFailureCode } from '~/application/ports/integrations/issues/issue-tracker.integration.ts';

/* 課題トラッカーに尋ねられなかった。**課題が無かったのではない。**

   **失敗をすべて同じエラーコードに潰さない。** `gh` が入っていない機械と、認証が切れている
   機械では、ユーザーがすべきことが違う。前者は入れる話で、後者は入り直す話である。
   画面がその 2 つを言い分けられるのは、ここで分けておいたときだけである。

   非ゼロ終了時の `stderr` は捨てずに `details` に残す。外へは出さないが、これが無いと
   「なぜ非ゼロだったのか」を後から誰も言えない。 */

export class TrackerReadError extends AppError {
  readonly code: TrackerFailureCode;

  constructor(
    message: string,
    code: TrackerFailureCode,
    options?: { cause?: unknown; details?: Record<string, unknown> },
  ) {
    super(message, options);
    this.code = code;
  }
}
