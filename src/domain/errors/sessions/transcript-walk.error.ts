import { AppError } from '~/app-kernel/error.ts';

/* 走査は通ったのに、そこに見えた `transcript` を全部は載せられなかった。

   ディレクトリを辿れて一覧は返ったが、1 本ずつを見に行くところで落ちた、という状況である。
   数が食い違う以上、その slug の `transcript` を数え上げられたとは言えない。 */
export class TranscriptWalkIncompleteError extends AppError {
  readonly code = 'transcript.walk_incomplete';
}
