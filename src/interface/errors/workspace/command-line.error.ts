import { AppError } from '~/app-kernel/error.ts';

/* コマンドラインだけに許した求めが、それ以外から届いた。

   **ディレクトリを名指すのも、走っている glasshive を終わらせるのも、コマンドラインだけで
   ある。** 画面から名指せると、開いているどのページも任意のディレクトリを glasshive に
   読ませられる —— そこがリポジトリかどうかを片端から尋ねて回れることになり、観測していない
   場所が一覧に生える。終わらせるほうは、開いているページが、観ている当のサーバーを落とせる
   ことになる。

   求めた側の落ち度なので、もう一度同じ形で求めても同じ答えになる。 */
export class NotCommandLineError extends AppError {
  readonly code = 'workspace.not_command_line';
}
