import { mapObserved, type Observation } from '~/app-kernel/observation.ts';
import { ok, type Result } from '~/app-kernel/result.ts';
import type { IssueLedgerRepository } from '~/application/ports/repositories/issues/issue-ledger.repository.ts';
import type { IssueLedger, IssueSummary } from '~/domain/entities/issues/issue.entity.ts';
import { parseLedger } from '~/domain/services/issues/issue-ledger.service.ts';

/* プロジェクト 1 つぶんの課題を一覧にする。

   台帳のテキストを課題にパースするのはここである。ポートが持ち帰るのはテキストだけで、課題と
   いう言葉を持たない。パースの決まり — 閉じたものを数えてから落とす、壊れた行は飛ばす —
   は domain の純関数に在り、ここはそれを読めたテキストに当てる。

   **観測をそのまま渡す。** 台帳が無いことを空の一覧に潰さない — 潰すと、bd を使っていない
   プロジェクトと、台帳を読めなかったプロジェクトと、課題が 1 件も無いプロジェクトが、
   ユーザーには同じに見える。 */

/* この呼び出しの出力。外へ写す側はこの名前だけを見る。
   台帳ひとつぶんの観測がそのまま出力なので、内側の名前を出力の名前として出す。 */
export type { IssueLedger, IssueSummary };

export interface ListIssuesInput {
  readonly projectPath: string;
  /** 閉じた課題も一覧に載せるか。載せなくても件数には出る */
  readonly includeClosed: boolean;
}

/* 断りようのない呼び出しである。パスは解決の済んだものが渡ってくるので、受理してよいかを
   ここで決める余地が無い。観測できたか・無かったか・観測できなかったかは `Observation` が言う。 */
export interface ListIssuesUseCase {
  execute(input: ListIssuesInput): Promise<Result<Observation<IssueLedger>, never>>;
}

export function createListIssues(deps: {
  readonly ledger: IssueLedgerRepository;
}): ListIssuesUseCase {
  return {
    async execute({ projectPath, includeClosed }) {
      const text = await deps.ledger.readLedgerText(projectPath);
      return ok(mapObserved(text, (value) => parseLedger(value, { includeClosed })));
    },
  };
}
