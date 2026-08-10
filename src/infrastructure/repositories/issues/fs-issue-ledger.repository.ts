import fs from 'node:fs';
import path from 'node:path';
import { UnexpectedError } from '~/app-kernel/error.ts';
import { type Observation, observed, unobservable } from '~/app-kernel/observation.ts';
import { isSafeAbsolutePath } from '~/app-kernel/path.ts';
import type { IssueLedgerRepository } from '~/application/ports/repositories/issues/issue-ledger.repository.ts';
import { LedgerReadError } from '~/infrastructure/errors/issues/ledger-read.error.ts';
import { classifyReadFailure } from '~/infrastructure/io/bounded-read.ts';

/* プロジェクトの中の課題台帳を、ファイルの読み取りだけで観る。bd へは問い合わせない。

   持ち帰るのはテキストだけである。その中身が何を言っているかは、ここでは読まない —
   パースを内側に置いておけば、保存先の都合が変わっても課題の意味は動かない。

   台帳は bd の書き出しであって、追記され続ける `transcript` ではない。行数は課題の数で
   決まるので、読み取り範囲を掛けずに全部を読む。**範囲で切ると、切られた課題が「無い」
   ものとして消え、件数まで狂う。** */

/** 台帳のパス。プロジェクトの直下の決まったパスにしか無い */
const LEDGER_PATH = ['.beads', 'issues.jsonl'] as const;

const ledgerFileOf = (projectPath: string): string => path.join(projectPath, ...LEDGER_PATH);

/* 無いのか、読めなかったのかを見分ける。

   errno を読むのは `classifyReadFailure` の仕事で、ここではやり直さない。二か所で見分けると
   「無い」と「読めなかった」の境目が散り、片方だけ直したときに食い違う。
   ここで変えるのはエラーコードだけ — 読めなかったのが台帳だと、外へ伝わるようにする。 */
function classifyLedgerFailure(error: unknown, file: string): Observation<never> {
  const failure = classifyReadFailure(error, file);
  if (failure.kind !== 'unobservable') return failure;
  const { details } = failure.error;
  return unobservable(
    new LedgerReadError(`Could not read ${file}`, {
      cause: error,
      ...(details === undefined ? {} : { details: { ...details } }),
    }),
  );
}

function readLedgerFile(projectPath: string): Observation<string> {
  /* パスを組み立てる前に、プロジェクトのパスとして使える文字列かを確かめる。

     `path.join('', '.beads', 'issues.jsonl')` は相対パスになり、開くのは走らせた
     作業ディレクトリの台帳になる。**別のプロジェクトの課題を、尋ねられたプロジェクトの課題として返す** —
     読めなかったと言うより悪い嘘である。無いとも言えない。台帳が在るかどうかは、まだ
     何も確かめていない。

     ここへ届くのは解決の済んだプロジェクトのパスである。そうでないなら塞ぎ忘れた穴なので、
     もう一度求めれば通るかもしれない側(503)ではなく、こちらの穴(500)として言う。 */
  if (!isSafeAbsolutePath(projectPath)) {
    return unobservable(
      new UnexpectedError('Ledger asked for with a path that is not a usable project root', {
        details: { projectPath },
      }),
    );
  }
  const file = ledgerFileOf(projectPath);
  try {
    return observed(fs.readFileSync(file, 'utf8'));
  } catch (error) {
    return classifyLedgerFailure(error, file);
  }
}

export function createFsIssueLedgerRepository(): IssueLedgerRepository {
  return {
    async readLedgerText(projectPath) {
      return readLedgerFile(projectPath);
    },
  };
}
