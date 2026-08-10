import type { Observation } from '~/app-kernel/observation.ts';

/* 課題トラッカーに問い合わせるポート。

   台帳を読む `IssueLedgerRepository` とは別のものである。あちらは形を知っているファイルを
   読んで、こちらの課題を組み立て直す。こちらは**他人のプログラムを起こして、他人の答えを
   受け取る**。失敗の語彙も違う — 無い・読めないではなく、コマンドが無い・断られた・
   時間内に答えなかった、になる。

   持ち帰るのは応答のテキストだけである。中身をどう読むかは domain の純関数に在り、実装に
   残る仕事は「起こして、テキストを受け取る」ことだけになる。

   `owner` と `name` は解決の済んだ値である。リクエストから来た文字列をそのまま渡しては
   いけない。どのリポジトリを観るかを決めるのは、観測したプロジェクトの remote であって、
   尋ねてきた側ではない。 */

/** コマンドがインストールされていない。何を尋ねても同じなので、ここで諦める */
export const TRACKER_NOT_INSTALLED = 'tracker.not_installed';

/** 起こせたが、非ゼロで終わった。認証切れも、リポジトリが無いのも、これになる */
export const TRACKER_EXIT_NONZERO = 'tracker.exit_nonzero';

/** 時間内に答えなかった */
export const TRACKER_TIMEOUT = 'tracker.timeout';

/** 起こす権利が無い */
export const TRACKER_DENIED = 'tracker.denied';

export type TrackerFailureCode =
  | typeof TRACKER_NOT_INSTALLED
  | typeof TRACKER_EXIT_NONZERO
  | typeof TRACKER_TIMEOUT
  | typeof TRACKER_DENIED;

export interface IssuePageRequest {
  readonly owner: string;
  readonly name: string;
  /** 前のページが答えた続きの位置。最初のページを求めるときは無い */
  readonly cursor: string | null;
  /** 1 ページで求める件数 */
  readonly pageSize: number;
}

export interface IssueTrackerIntegration {
  /* 課題 1 ページぶんの応答テキスト。

     **コマンドが入っていないのは「無かった」ではない。** 尋ねる先はあるのに尋ねられなかった
     のだから `unobservable` である。それを画面がどう見せるか — 案内を出すか、エラーを出すか —
     はエラーコードを見て決める話で、観測の側で丸めることではない。

     どのリポジトリも指していないプロジェクトを `absent` と言うのは、ここではなく呼ぶ側である。
     このポートは owner と name を受け取った時点で、尋ねる先を持っている。 */
  fetchIssuePage(request: IssuePageRequest): Promise<Observation<string>>;
}
