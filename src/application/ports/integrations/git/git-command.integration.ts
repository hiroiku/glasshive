import type { AppError } from '~/app-kernel/error.ts';
import type { Observation } from '~/app-kernel/observation.ts';

/* `git` を起こすポート。

   ここだけは標準出力をそのまま返す。パースは内側の純関数に在るので、実装に残る仕事は
   「起こして、出力のテキストを受け取る」ことだけになり、ファイルも `git` も無しで
   パースを確かめられる。

   呼び出しも出力も、このポートが自分で宣言した形だけで書く。内側の型の名をここに出すと、
   ポートを実装する側がその名を辿らねばならなくなり、素材を運ぶだけという約束が崩れる。

   **失敗をすべて空文字列に潰さない。** 潰すと、`git` がインストールされていない機械で、
   すべてのリポジトリが「リポジトリではない」と出る。何が起きたのかは `code` に残し、
   どう読むかは呼ぶ側が決める。 */

/** `git` がインストールされていない。何を尋ねても同じなので、ここで諦める */
export const GIT_NOT_INSTALLED = 'git.not_installed';

/* 起こせたが、非ゼロで終わり、なぜ非ゼロだったのかを読めなかった。分かれ目の無い先端や、
   まだコミットの無いブランチのように、尋ねた事柄がそこに無いだけのこともこれで終わる。

   **そこがリポジトリでないことは、これにはならない。** `git` 自身がそう言った答えは
   `absent` で返る。読めなかった失敗を「無かった」に寄せると、断られたリポジトリが
   「リポジトリではない」として出る。 */
export const GIT_EXIT_NONZERO = 'git.exit_nonzero';

/** 時間内に答えなかった */
export const GIT_TIMEOUT = 'git.timeout';

/** 起こす権利が無い。`git` がそのリポジトリを読むのを断ったときもこれになる */
export const GIT_DENIED = 'git.denied';

export type GitFailureCode =
  | typeof GIT_NOT_INSTALLED
  | typeof GIT_EXIT_NONZERO
  | typeof GIT_TIMEOUT
  | typeof GIT_DENIED;

/* 渡してよい `revision` 1 つ。**このポートは文字列の形を検証しない。**
   検証は `Revision` を作る側で済んでいて、ここは受け取った文字列を運ぶだけである。
   裸の文字列ではなく型で包んで受けるのは、リクエストと共に来た文字列がそのまま
   紛れ込まないようにするためである。 */
export interface RevisionSpec {
  readonly value: string;
}

export interface GitCommandRequest {
  /** どこで起こすか */
  readonly cwd: string;
  /* サブコマンドとオプション。**外から来た文字列をここへ混ぜない。**
     `-` で始まる文字列がここに在ると、そのまま `git` のオプションとして読まれる。 */
  readonly args: readonly string[];
  /* `revision`。実装は `--end-of-options` の後ろに置くので、ここの文字列はオプションにならない */
  readonly revisions: readonly RevisionSpec[];
}

export interface GitCommandIntegration {
  /** 起こして、標準出力をそのまま返す */
  run(request: GitCommandRequest): Promise<Observation<string>>;
}

/* 出力の読み方は、尋ねた側でなく尋ねた事柄で決まる。だから読み方を決める関数はこのポートの隣に置く。

   非ゼロで終わったのは、出力が無かったものとして読む。分かれ目の無い先端や、まだコミットの
   無いブランチでは普通に起こることである。それ以外の失敗 — `git` がインストールされていない・
   権利が無い・時間切れ — は何を尋ねても同じ結果になるので、そこで止める。

   **空の出力を「そこには無かった」と読むときだけは、非ゼロで終わったかを見る。**
   非ゼロで終わった理由は `git` を起こした側にしか読めず、読めなかった理由をそのまま
   「無かった」に変えると、断られたリポジトリが「リポジトリではない」として出る。 */

/** 起こせなかったときの出力は空文字列として読む */
export const outputOrEmpty = (output: Observation<string>): string =>
  output.kind === 'observed' ? output.value : '';

/** 先へ進んでも無駄な失敗があれば、それを返す */
export function blockingFailure(outputs: readonly Observation<string>[]): AppError | null {
  for (const output of outputs) {
    if (output.kind === 'unobservable' && output.error.code !== GIT_EXIT_NONZERO) {
      return output.error;
    }
  }
  return null;
}

/** 答えを受け取れなかった呼び出しがあれば、その失敗を返す。無ければ出力の空は「無かった」である */
export function unreadFailure(outputs: readonly Observation<string>[]): AppError | null {
  for (const output of outputs) {
    if (output.kind === 'unobservable') return output.error;
  }
  return null;
}
