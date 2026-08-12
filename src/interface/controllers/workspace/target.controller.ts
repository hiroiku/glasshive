import type { ObserveTargetUseCase } from '~/application/use-cases/workspace/observe-target.use-case.ts';
import {
  presentTarget,
  type TargetJson,
} from '~/interface/presenters/workspace/target.presenter.ts';

/* 起動のときに名指されたディレクトリを答えるコントローラー。

   `frameworks` を知らない形にしてある。リクエストもレスポンスも素の値で、`Request` も
   `Response` も出てこない。

   受け取るものが 1 つも無い。**名指すのは起動のときだけで、ブラウザーからは名指せない。**
   ここがパスを受け取ると、画面から任意のディレクトリを開けるようになる。 */

export interface TargetDeps {
  readonly target: ObserveTargetUseCase;
}

/* 答えは名指されたものそのものなので、断りを載せる欄が無い。断りは断りとして投げ、
   エラーコードから HTTP ステータスを引く側へ渡す。 */
export async function readTarget(deps: TargetDeps): Promise<TargetJson | null> {
  const target = await deps.target.execute();
  if (!target.ok) throw target.error;
  return presentTarget(target.value);
}
