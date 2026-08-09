import { AppError } from '~/app-kernel/error.ts';

/* 課題台帳を読みに行けなかった。**無かったのではない。**

   無い台帳は誤りではなく `absent('no-source')` で返る。ここへ来るのは、読む権利が無いなど、
   台帳が在るかもしれないのに確かめられなかったときだけである。 */
export class LedgerReadError extends AppError {
  readonly code = 'ledger.unreadable';
}
