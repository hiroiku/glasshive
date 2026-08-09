import type { AppError } from '~/app-kernel/error.ts';
import type { Observation } from '~/app-kernel/observation.ts';

/* 記録を読む道具を起こす口。

   ここだけは字面をそのまま返す。読み解きは内側の純関数に在るので、実装に残る仕事は
   「起こして、答えの字を受け取る」ことだけになり、ファイルも git も無しで読み解きを
   確かめられる。

   **求めも答えも、この口が自分で宣言した形だけで書く。** 内側の型の名をここに出すと、
   口を実装する側がその名を辿らねばならなくなり、素材を運ぶだけという約束が崩れる。

   **落ちたことを空の字に潰さない。** 旧実装は落ちるとどれも空文字を返していたので、
   git が入っていない機械では、すべてのリポジトリが「リポジトリではない」と出た。
   何が起きたのかは `code` に残し、どう読むかは呼ぶ側が決める。 */

/** 記録を読む道具が手元に無い。何を尋ねても同じなので、ここで諦める */
export const GIT_NOT_INSTALLED = 'git.not_installed';

/** 起こせたが、非ゼロで終わった。指しが無い・そこがリポジトリでない、はどれもこれになる */
export const GIT_EXIT_NONZERO = 'git.exit_nonzero';

/** 時間内に答えなかった */
export const GIT_TIMEOUT = 'git.timeout';

/** 起こす権利が無い */
export const GIT_DENIED = 'git.denied';

export type GitFailureCode =
  | typeof GIT_NOT_INSTALLED
  | typeof GIT_EXIT_NONZERO
  | typeof GIT_TIMEOUT
  | typeof GIT_DENIED;

/* 渡してよい指し 1 つ。**この口は字の形を確かめない。**
   確かめは指しを作る側で済んでいて、ここは受け取った字を運ぶだけである。
   裸の字ではなく包みで受けるのは、求めと共に来た字がそのまま紛れ込まないようにするため。 */
export interface RevisionSpec {
  readonly value: string;
}

export interface GitCommandRequest {
  /** どこで起こすか */
  readonly cwd: string;
  /* 部分命令と指定。**外から来た字をここへ混ぜない。**
     `-` で始まる字がここに在ると、そのまま外の道具の指定として読まれる。 */
  readonly args: readonly string[];
  /* 指し。実装は `--end-of-options` の後ろに置くので、ここの字は指定にならない */
  readonly revisions: readonly RevisionSpec[];
}

export interface GitCommandIntegration {
  /** 起こして、標準出力の字をそのまま返す */
  run(request: GitCommandRequest): Promise<Observation<string>>;
}

/* 答えの読み方は、尋ねた側でなく尋ねた事柄で決まる。だから読み方の道具はこの口の隣に置く。

   非ゼロで終わったのは、答えが無かったものとして読む。分かれ目の無い先端や、まだ記録の
   無い枝では普通に起こることで、旧実装もそう読んでいた。それ以外の失敗 — 道具が手元に
   無い・権利が無い・時間切れ — は何を尋ねても同じ答えになるので、そこで止める。 */

/** 起こせなかった答えは空の字として読む */
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
