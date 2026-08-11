import { AppError } from '~/app-kernel/error.ts';

/* `gh` は答えたが、その答えから課題へ辿れなかった。**課題が無かったのではない。**

   認証の切れた応答も、GraphQL が `errors` だけを載せた応答も、テキストとしては返ってくる。
   それを空の一覧に潰すと、読む人は「このリポジトリに課題は無い」と読む。だから
   `unobservable` で運び、画面が「観測できなかった」と言えるようにする。 */

export class TrackerResponseUnreadableError extends AppError {
  readonly code = 'tracker.unreadable_response';
}
