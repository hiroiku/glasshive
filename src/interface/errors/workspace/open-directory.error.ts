import { AppError } from '~/app-kernel/error.ts';

/* 開く先として読めない求めが届いた。

   **これは境目の誤りである。** 内側は絶対パスしか受け取らないので、形の食い違いはここで
   止める。求めた側の落ち度なので、もう一度同じ形で求めても同じ答えになる。 */
export class InvalidOpenRequestError extends AppError {
  readonly code = 'workspace.invalid_path';
}

/* コマンドライン以外からディレクトリを名指された。

   **名指せるのはコマンドラインだけである。** 画面から名指せると、開いているどのページも
   任意のディレクトリを glasshive に読ませられる —— そこがリポジトリかどうかを片端から
   尋ねて回れることになり、観測していない場所が一覧に生える。 */
export class NotCommandLineError extends AppError {
  readonly code = 'workspace.not_command_line';
}
