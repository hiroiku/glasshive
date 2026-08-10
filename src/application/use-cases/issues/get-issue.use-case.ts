import { absent, type Observation, observed } from '~/app-kernel/observation.ts';
import { ok, type Result } from '~/app-kernel/result.ts';
import type { IssueLedgerRepository } from '~/application/ports/repositories/issues/issue-ledger.repository.ts';
import type { IssueRecord } from '~/domain/entities/issues/issue.entity.ts';
import { findIssueRecord } from '~/domain/services/issues/issue-ledger.service.ts';

/* 課題 1 件を、台帳に書かれていた欄ぜんぶで引く。

   一覧が落としている本文はここで返る。一覧に載せないのは大きさのためであって、
   持っていないからではない。

   引くのは同じ台帳のテキストからである。ポートはテキストを持ち帰るだけなので、
   当たりを探すのはここ。 */

/* この呼び出しの出力。台帳に書かれていた記録がそのまま出力である */
export type { IssueRecord };

export interface GetIssueInput {
  readonly projectPath: string;
  readonly id: string;
}

/* 断りようのない呼び出しである。パスは解決の済んだものが渡ってくるので、受理してよいかを
   ここで決める余地が無い。観測できたか・無かったか・観測できなかったかは `Observation` が言う。 */
export interface GetIssueUseCase {
  execute(input: GetIssueInput): Promise<Result<Observation<IssueRecord>, never>>;
}

export function createGetIssue(deps: { readonly ledger: IssueLedgerRepository }): GetIssueUseCase {
  return {
    async execute({ projectPath, id }) {
      const text = await deps.ledger.readLedgerText(projectPath);
      if (text.kind !== 'observed') return ok(text);
      const record = findIssueRecord(text.value, id);
      /* 台帳は読めた。その中にその課題が無かった、というのは観測できた事実である。
         台帳ごと無い(`no-source`)と同じ結果にすると、bd を使っていないプロジェクトと、
         課題を閉じて消したプロジェクトが見分けられなくなる。 */
      return ok(record === null ? absent('empty') : observed(record));
    },
  };
}
