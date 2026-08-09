import { AppError } from '~/app-kernel/error.ts';

/* 届いた求めを、観測への問いとして読めなかった。

   **これは境目の誤りである。** 内側は読める問いしか受け取らないので、
   形の食い違いはここで止める。求めた側の落ち度なので、もう一度同じ形で求めても同じ。 */
export class InvalidSessionsRequestError extends AppError {
  readonly code = 'sessions.invalid_request';
}
