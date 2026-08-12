import { err, ok, type Result } from '~/app-kernel/result.ts';
import type { TreeSnapshotService } from '~/application/services/sessions/tree-snapshot.service.ts';
import {
  isLocale,
  type ReadPreferencesUseCase,
} from '~/application/use-cases/workspace/read-preferences.use-case.ts';
import type {
  PreferenceAction,
  TabAction,
  WritePreferencesUseCase,
} from '~/application/use-cases/workspace/write-preferences.use-case.ts';
import { InvalidTabActionError } from '~/interface/errors/workspace/tab-action.error.ts';
import { type ApiResponse, presentError } from '~/interface/presenters/api-error.presenter.ts';
import {
  type PreferencesJson,
  presentPreferences,
} from '~/interface/presenters/workspace/preferences.presenter.ts';

/* タブの選択を読み書きするコントローラー。

   `frameworks` を知らない形にしてある。リクエストもレスポンスも素の値で、`Request` も
   `Response` も出てこない。

   **届いた形を検証するのはここの仕事である。** 内側は読める操作しか受け取らない。
   送り手が glasshive 自身の画面でも、届いたものが同じ形だとは限らないので、境目で確かめる。

   観測しているものを渡すのもここの仕事である。タブの選択の側は観測を持たないので、
   タブに出す対象も、書いてよいパスかを判断する材料も、いまのスナップショットから起こして
   渡す。 */

export interface PreferencesDeps {
  readonly read: ReadPreferencesUseCase;
  readonly write: WritePreferencesUseCase;
  readonly tree: TreeSnapshotService;
}

/* 送る側が宣言する型。**送る側と受ける側が同じ 1 つの名前を見る。**
   両側で別々に書くと、片方だけ増えたときに気付けない。型は自己申告でしかないので、
   届いたものは型に関わらず検証する。 */
export type { PreferenceAction, TabAction };

/** 置きに行った結果。**通ったときと断られたときで形が違う** */
export type PreferencesResponse = ApiResponse<PreferencesJson>;

/** 記録が自分で持っている欄だけを読む。プロトタイプから来た欄はリクエストの欄ではない */
const own = (record: Record<string, unknown>, key: string): unknown =>
  Object.hasOwn(record, key) ? record[key] : undefined;

/* 届いたものを、操作として読めるときだけ受ける。

   **読めなければ断る。既定を置かない。** 出鱈目を「留めない」と読み替えて置くと、
   送り間違いが `preferences.json` の書き換えとして通ってしまう。 */
function actionOf(input: unknown): Result<PreferenceAction, InvalidTabActionError> {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) {
    return err(new InvalidTabActionError('Request is not readable as a preference action'));
  }
  const record = input as Record<string, unknown>;

  /* 何をしたいのかを先に見る。後にすると、知らない操作に対して
     「どれに対する操作か分からない」と答えることになり、判断が実態とずれる。 */
  const action = own(record, 'action');
  if (action !== 'pin' && action !== 'unpin' && action !== 'move' && action !== 'locale') {
    return err(new InvalidTabActionError('Action is not pin, unpin, move nor locale'));
  }

  /* 言葉の選択には相手の id が要らない。**知らない綴りは断る** —— 既定へ倒して受けると、
     送り間違いが「英語を選んだ」として `preferences.json` に残る。`null` は選ぶのをやめる
     ことなので、これだけは受ける。 */
  if (action === 'locale') {
    const locale = own(record, 'locale');
    if (locale === null) return ok({ action, locale: null });
    if (!isLocale(locale)) {
      return err(new InvalidTabActionError('Locale is not one of the languages this UI ships'));
    }
    return ok({ action, locale });
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

/** いま観測しているプロジェクトの id と、解決済みのパス */
async function observedFrom(
  tree: TreeSnapshotService,
): Promise<Result<{ ids: readonly string[]; roots: readonly string[] }>> {
  const snapshot = await tree.get();
  // 通らなかった呼び出しから材料は起こせない。断りはそのまま持ち回る
  if (!snapshot.ok) return err(snapshot.error);
  return ok({
    ids: snapshot.value.projects.map((project) => project.id),
    /* パスの分からないプロジェクトは材料にならない。渡しても書き先の判定に使えないので
       落とす。落としてもガードは緩まない — 観測元そのものを守るガードは、保存先の実装が
       自分で持っている。 */
    roots: snapshot.value.projects
      .map((project) => project.canonicalPath)
      .filter((path): path is string => path !== null),
  });
}

/* タブの選択を読む。**結果は選択そのものなので、断りを載せる欄が無い。**
   断りは断りとして投げ、エラーコードから HTTP ステータスを引く側へ渡す。 */
export async function readPreferences(deps: PreferencesDeps): Promise<PreferencesJson> {
  const scope = await observedFrom(deps.tree);
  if (!scope.ok) throw scope.error;
  return presentPreferences(await deps.read.execute(scope.value.ids));
}

/* 操作を置く。**通らなかったことは値で返す。投げない。**

   ここだけは観測ではなく人の操作なので、通ったのか断られたのかを結果に載せる。
   載せずに黙って通ったことにすると、ピン留めしたつもりのタブが次に開いたときに消える。 */
export async function writePreferences(
  deps: PreferencesDeps,
  input: unknown,
): Promise<PreferencesResponse> {
  const action = actionOf(input);
  // 形が読めないリクエストは、観測にも保存先にも触らずに断る
  if (!action.ok) return { ok: false, ...presentError(action.error) };

  const scope = await observedFrom(deps.tree);
  /* スナップショットを起こせなければ置きに行かない。**書いてよいパスかを判断する材料が
     欠けたまま置くと、観測したプロジェクトの中へ書き込んでしまう。**
     確かめられない側では書かない。 */
  if (!scope.ok) return { ok: false, ...presentError(scope.error) };

  const saved = await deps.write.execute({
    action: action.value,
    observedIds: scope.value.ids,
    observedRoots: scope.value.roots,
  });
  if (!saved.ok) return { ok: false, ...presentError(saved.error) };
  return { ok: true, body: presentPreferences(saved.value) };
}
