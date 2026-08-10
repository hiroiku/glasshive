import { AppError } from '~/app-kernel/error.ts';
import type { GitFailureCode } from '~/application/ports/integrations/git/git-command.integration.ts';

/* `git` を起動できなかった、あるいは起動したが出力が返らなかった。

   **失敗をすべて同じエラーコードに潰さない。** 潰すと、`git` がインストールされていない
   機械で、すべてのリポジトリが「リポジトリではない」と出る。何が起きたのかはここで分け、
   外へ返す HTTP ステータスはエラーコードから決める。

   非ゼロ終了時の `stderr` は捨てずに `details` に残す。外へは出さないが、これが無いと
   「なぜ非ゼロだったのか」を後から誰も言えない。 */

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
