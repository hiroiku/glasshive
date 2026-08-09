import { AppError } from '~/app-kernel/error.ts';
import type { GitFailureCode } from '~/application/ports/integrations/git/git-command.integration.ts';

/* 記録を読む道具を起こせなかった、あるいは起こしたが答えが返らなかった。

   **名札を 1 つにしない。** 旧実装はどの失敗も同じ空文字に潰していたので、道具が手元に
   無い機械では、すべてのリポジトリが「リポジトリではない」と出た。何が起きたのかは
   ここで分け、外へ出す番号は名札から決める。

   非ゼロで終わったときの言い分(stderr)は捨てずに `details` に残す。外へは出さないが、
   これが無いと「なぜ非ゼロだったのか」を後から誰も言えない。 */

export class GitCommandError extends AppError {
  readonly code: GitFailureCode;

  constructor(
    message: string,
    code: GitFailureCode,
    options?: { cause?: unknown; details?: Record<string, unknown> },
  ) {
    super(message, options);
    this.code = code;
  }
}
