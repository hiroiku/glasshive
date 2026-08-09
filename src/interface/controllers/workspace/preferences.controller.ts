import { err, ok, type Result } from '~/app-kernel/result.ts';
import type { TreeSnapshotService } from '~/application/services/sessions/tree-snapshot.service.ts';
import type { ReadPreferencesUseCase } from '~/application/use-cases/workspace/read-preferences.use-case.ts';
import type {
  TabAction,
  WritePreferencesUseCase,
} from '~/application/use-cases/workspace/write-preferences.use-case.ts';
import { InvalidTabActionError } from '~/interface/errors/workspace/tab-action.error.ts';
import { type ApiResponse, presentError } from '~/interface/presenters/api-error.presenter.ts';
import {
  type PreferencesJson,
  presentPreferences,
} from '~/interface/presenters/workspace/preferences.presenter.ts';

/* 選びを読み書きする窓。

   枠組みを知らない形にしてある。求めも答えも素の値で、`Request` も `Response` も出てこない。

   **届いた形を検めるのはここの仕事である。** 内側は読める申し出しか受け取らない。
   送り手が同じ道具でも、届いたものが同じ形だとは限らないので、境目で確かめる。

   **観測しているものを渡すのもここの仕事である。** 選びの側は観測を持たないので、
   タブに出す対象も、書いてよい場所かの材料も、いまの盤面から起こして渡す。 */

export interface PreferencesDeps {
  readonly read: ReadPreferencesUseCase;
  readonly write: WritePreferencesUseCase;
  readonly tree: TreeSnapshotService;
}

/* 送る側が名乗る形。**送る側と受ける側が同じ 1 つの名前を見る。**
   両側で別々に書くと、片方だけ増えたときに気付けない。名乗りは名乗りでしかないので、
   届いたものは型に関わらず検める。 */
export type { TabAction };

/** 置きに行った答え。**通ったときと断られたときで形が違う** */
export type PreferencesResponse = ApiResponse<PreferencesJson>;

/** 記録が自分で持っている欄だけを読む。土台から生えた欄は求めの欄ではない */
const own = (record: Record<string, unknown>, key: string): unknown =>
  Object.hasOwn(record, key) ? record[key] : undefined;

/* 届いたものを、申し出として読めるときだけ受ける。

   **読めなければ断る。既定を置かない。** 出鱈目を「留めない」と読み替えて置くと、
   送り間違いが覚え書きの書き換えとして通ってしまう。 */
function tabActionOf(input: unknown): Result<TabAction, InvalidTabActionError> {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) {
    return err(new InvalidTabActionError('Request is not readable as a tab action'));
  }
  const record = input as Record<string, unknown>;

  /* 何をしたいのかを先に見る。後にすると、知らない申し出に対して
     「どれに対する申し出か分からない」と答えることになり、言い分が実態とずれる。 */
  const action = own(record, 'action');
  if (action !== 'pin' && action !== 'unpin' && action !== 'move') {
    return err(new InvalidTabActionError('Action is neither pin, unpin nor move'));
  }

  const id = own(record, 'id');
  if (typeof id !== 'string' || id === '') {
    return err(new InvalidTabActionError('No id to act on'));
  }

  if (action === 'pin' || action === 'unpin') return ok({ action, id });

  const toIndex = own(record, 'toIndex');
  // 端の丸めは内側がする。ここで見るのは「数として読めるか」だけ
  if (typeof toIndex !== 'number' || !Number.isFinite(toIndex)) {
    return err(new InvalidTabActionError('Move target is not readable as a number'));
  }
  return ok({ action, id, toIndex });
}

/** いま観測している巣の id と、解決済みの場所 */
async function observedFrom(
  tree: TreeSnapshotService,
): Promise<Result<{ ids: readonly string[]; roots: readonly string[] }>> {
  const snapshot = await tree.get();
  // 受理されなかった求めから材料は起こせない。断りはそのまま持ち回る
  if (!snapshot.ok) return err(snapshot.error);
  return ok({
    ids: snapshot.value.projects.map((project) => project.id),
    /* 場所の分からない巣は材料にならない。渡しても書き先の判定に使えないので落とす。
       落としても見張りは緩まない — 観測元そのものの見張りは置き場の側に焼いてある。 */
    roots: snapshot.value.projects
      .map((project) => project.canonicalPath)
      .filter((path): path is string => path !== null),
  });
}

/* 選びを読む。**答えは選びそのものなので、断りを載せる欄が無い。**
   断りは断りとして投げ、名札から番号を引く役へ渡す。 */
export async function readPreferences(deps: PreferencesDeps): Promise<PreferencesJson> {
  const scope = await observedFrom(deps.tree);
  if (!scope.ok) throw scope.error;
  return presentPreferences(await deps.read.execute(scope.value.ids));
}

/* 申し出を置く。**通らなかったことは値で返す。投げない。**

   ここだけは観測ではなく人の申し出なので、通ったのか断られたのかを答えに載せる。
   載せずに黙って通ったことにすると、留めたつもりの印が次に開いたときに消える。 */
export async function writePreferences(
  deps: PreferencesDeps,
  input: unknown,
): Promise<PreferencesResponse> {
  const action = tabActionOf(input);
  // 形が読めない求めは、観測にも置き場にも触らずに断る
  if (!action.ok) return { ok: false, ...presentError(action.error) };

  const scope = await observedFrom(deps.tree);
  /* 盤面を起こせなければ置きに行かない。**書いてよい場所かの材料が欠けたまま置くと、
     観測した巣の中へ落ちる。確かめられない側では書かない。** */
  if (!scope.ok) return { ok: false, ...presentError(scope.error) };

  const saved = await deps.write.execute({
    action: action.value,
    observedIds: scope.value.ids,
    observedRoots: scope.value.roots,
  });
  if (!saved.ok) return { ok: false, ...presentError(saved.error) };
  return { ok: true, body: presentPreferences(saved.value) };
}
