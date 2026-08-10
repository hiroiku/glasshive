import { AppError } from '~/app-kernel/error.ts';

/* 届いたリクエストを、タブの選択への操作として読めなかった。

   **これは境目の誤りである。** 内側は読める操作しか受け取らないので、
   形の食い違いはここで止める。求めた側の落ち度なので、もう一度同じ形で求めても同じ。 */
export class InvalidTabActionError extends AppError {
  readonly code = 'workspace.invalid_action';
}
