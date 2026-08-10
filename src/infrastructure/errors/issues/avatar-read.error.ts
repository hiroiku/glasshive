import { AppError } from '~/app-kernel/error.ts';
import type { AvatarFailureCode } from '~/application/ports/integrations/issues/avatar.integration.ts';

/* 顔を読めなかった。

   **課題を読めなかったのとは別の失敗である。** 顔が 1 枚欠けても一覧は出るし、出さねば
   ならない。同じエラーコードに混ぜると、顔が取れないだけの機械で課題の画面が赤くなる。

   繋がらなかったのと、相手に断られたのを分ける。前者はこちらの通信の話で、後者は
   向こうの都合である。 */

export class AvatarReadError extends AppError {
  readonly code: AvatarFailureCode;

  constructor(
    message: string,
    code: AvatarFailureCode,
    options?: { cause?: unknown; details?: Record<string, unknown> },
  ) {
    super(message, options);
    this.code = code;
  }
}
