import fs from 'node:fs';
import path from 'node:path';
import { UnexpectedError } from '~/app-kernel/error.ts';
import { type Observation, observed, unobservable } from '~/app-kernel/observation.ts';
import { isSafeAbsolutePath } from '~/app-kernel/path.ts';
import type { IssueLedgerRepository } from '~/application/ports/repositories/issues/issue-ledger.repository.ts';
import { LedgerReadError } from '~/infrastructure/errors/issues/ledger-read.error.ts';
import { classifyReadFailure } from '~/infrastructure/io/bounded-read.ts';

/* 巣の中の課題台帳を、ファイルの読み取りだけで観る。bd へは問い合わせない。

   持ち帰るのは字だけである。**その字が何を言っているかは、ここでは読まない** —
   読み解きを内側に置いておけば、置き場の都合が変わっても課題の意味は動かない。

   台帳は bd の書き出しであって、追記され続ける正本ではない。行の数は課題の数で決まるので、
   窓を掛けずに全部を読む。**窓で切ると、切られた課題が「無い」ものとして消える** —
   件数の札まで狂うので、この読み取りでは切れない。 */

/** 台帳の在り処。巣の直下の決まった場所にしか無い */
const LEDGER_PATH = ['.beads', 'issues.jsonl'] as const;

const ledgerFileOf = (projectPath: string): string => path.join(projectPath, ...LEDGER_PATH);

/* 無いのか、読めなかったのかを見分ける。

   errno を読むのは `classifyReadFailure` の仕事で、ここではやり直さない。二か所で見分けると
   「無い」と「読めなかった」の境目が散り、片方だけ直したときに食い違う。
   ここで変えるのは名札だけ — 読めなかったのが台帳だと、外へ伝わるようにする。 */
function classifyLedgerFailure(error: unknown, file: string): Observation<never> {
  const failure = classifyReadFailure(error, file);
  if (failure.kind !== 'unobservable') return failure;
  const { details } = failure.error;
  return unobservable(
    new LedgerReadError(`${file} を読めなかった`, {
      cause: error,
      ...(details === undefined ? {} : { details: { ...details } }),
    }),
  );
}

function readLedgerFile(projectPath: string): Observation<string> {
  /* 名前を組み立てる前に、巣の場所として使える字かを確かめる。

     `path.join('', '.beads', 'issues.jsonl')` は相対の名前になり、開くのは走らせた場所の
     台帳になる。**別の巣の課題を、尋ねられた巣の課題として返す** — 読めなかったと言うより
     悪い嘘である。無いとも言えない。台帳が在るかどうかは、まだ何も確かめていない。

     ここへ届く字は解決の済んだ巣の場所である。そうでないなら塞ぎ忘れた穴なので、
     もう一度求めれば通るかもしれない側(503)ではなく、こちらの穴(500)として言う。 */
  if (!isSafeAbsolutePath(projectPath)) {
    return unobservable(
      new UnexpectedError('巣の場所として使えない字で台帳を尋ねられた', {
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
