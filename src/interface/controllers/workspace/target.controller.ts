import type { ObserveTargetUseCase } from '~/application/use-cases/workspace/observe-target.use-case.ts';
import {
  InvalidOpenRequestError,
  NotCommandLineError,
} from '~/interface/errors/workspace/open-directory.error.ts';
import { type ApiResponse, presentError } from '~/interface/presenters/api-error.presenter.ts';
import {
  type OpenedJson,
  presentOpened,
  presentTarget,
  type TargetJson,
} from '~/interface/presenters/workspace/target.presenter.ts';

/* 名指されたディレクトリを答えるコントローラー。

   `frameworks` を知らない形にしてある。リクエストもレスポンスも素の値で、`Request` も
   `Response` も出てこない。

   入口が 2 つある。**画面が尋ねるほうは何も受け取らない** —— 起動のときに名指された相手を
   答えるだけである。**あとから伝えるほう**はパスを受け取るが、受け取ってよいのはコマンド
   ラインからの求めだけで、それ以外は断る。 */

export interface TargetDeps {
  readonly target: ObserveTargetUseCase;
}

export interface OpenDirectoryRequest {
  /** 開きたいディレクトリ。絶対パス */
  readonly path: unknown;
  /* コマンドラインから来た求めか。**名指せるのはコマンドラインだけである** —— 画面から
     名指せると、開いているどのページも任意のディレクトリを glasshive に読ませられる。

     見分けるのは求めが届いた側で、ここへは見分けた結果だけが来る。 */
  readonly fromCommandLine: boolean;
}

/** 開く先を答えた結果。**通ったときと断られたときで形が違う** */
export type OpenDirectoryResponse = ApiResponse<OpenedJson>;

/* 起動のときに名指された相手を読む。**答えはその相手そのものなので、断りを載せる欄が無い。**
   断りは断りとして投げ、エラーコードから HTTP ステータスを引く側へ渡す。 */
export async function readTarget(deps: TargetDeps): Promise<TargetJson | null> {
  const target = await deps.target.execute();
  if (!target.ok) throw target.error;
  return presentTarget(target.value);
}

/* すでに走っている glasshive へ、開きたいディレクトリを伝える。

   **通らなかったことは値で返す。投げない。** ここへ来るのは観測ではなく人の操作で、
   伝えに来たコマンドは通ったかどうかで次にすることが変わる。 */
export async function openDirectory(
  deps: TargetDeps,
  request: OpenDirectoryRequest,
): Promise<OpenDirectoryResponse> {
  if (!request.fromCommandLine) {
    return {
      ok: false,
      ...presentError(
        new NotCommandLineError('Only the command line can name a directory to open'),
      ),
    };
  }
  if (typeof request.path !== 'string' || request.path === '') {
    return {
      ok: false,
      ...presentError(new InvalidOpenRequestError('Request does not name a directory to open')),
    };
  }

  const target = await deps.target.execute(request.path);
  if (!target.ok) return { ok: false, ...presentError(target.error) };
  /* 名指した場所に何も観測できていなくても断らない。**それは失敗ではない** ——
     開く先が Overview になるだけである。 */
  return { ok: true, body: presentOpened(target.value) };
}
