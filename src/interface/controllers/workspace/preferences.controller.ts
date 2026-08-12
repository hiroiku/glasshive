import { err, ok, type Result } from '~/app-kernel/result.ts';
import { isLocale } from '~/application/i18n/locale.ts';
import type { TranscriptIndexService } from '~/application/services/sessions/transcript-index.service.ts';
import type {
  ObservedProjectRef,
  ReadPreferencesUseCase,
} from '~/application/use-cases/workspace/read-preferences.use-case.ts';
import type {
  PreferenceAction,
  TabAction,
  WritePreferencesUseCase,
} from '~/application/use-cases/workspace/write-preferences.use-case.ts';
import { InvalidTabActionError } from '~/interface/errors/workspace/tab-action.error.ts';
import { type ApiResponse, presentError } from '~/interface/presenters/api-error.presenter.ts';
import {
  type CandidateView,
  type PreferencesJson,
  presentPreferences,
} from '~/interface/presenters/workspace/preferences.presenter.ts';

/* 観ると決めたものを読み書きするコントローラー。

   `frameworks` を知らない形にしてある。リクエストもレスポンスも素の値で、`Request` も
   `Response` も出てこない。

   **届いた形を検証するのはここの仕事である。** 内側は読める操作しか受け取らない。
   送り手が glasshive 自身の画面でも、届いたものが同じ形だとは限らないので、境目で確かめる。

   観測しているものを渡すのもここの仕事である。記録の側は観測を持たないので、タブに出す
   対象も、id からパスへ読み替える材料も、書いてよいパスかを判断する材料も、いまの
   スナップショットから起こして渡す。 */

export interface PreferencesDeps {
  readonly read: ReadPreferencesUseCase;
  readonly write: WritePreferencesUseCase;
  readonly index: TranscriptIndexService;
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
  if (action !== 'watch' && action !== 'unwatch' && action !== 'move' && action !== 'locale') {
    return err(new InvalidTabActionError('Action is not watch, unwatch, move nor locale'));
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

  if (action === 'watch' || action === 'unwatch') return ok({ action, id });

  const toIndex = own(record, 'toIndex');
  // 端の丸めは内側がする。ここで見るのは「数として読めるか」だけ
  if (typeof toIndex !== 'number' || !Number.isFinite(toIndex)) {
    return err(new InvalidTabActionError('Move target is not readable as a number'));
  }
  return ok({ action, id, toIndex });
}

/* いま見つかっているプロジェクトの id と、解決済みのパス。

   **木ではなく索引を見る。** 木に居るのは観ると決めたものだけで、まだ記録していない
   ディレクトリは居ない —— 木から起こすと、Overview から選び直す相手が居なくなる。 */
async function observedFrom(index: TranscriptIndexService): Promise<
  Result<{
    rows: readonly ObservedProjectRef[];
    roots: readonly string[];
    candidates: readonly CandidateView[];
  }>
> {
  const snapshot = await index.get();
  // 通らなかった呼び出しから材料は起こせない。断りはそのまま持ち回る
  if (!snapshot.ok) return err(snapshot.error);
  const { stubs } = snapshot.value.index;
  /* パスの分からないプロジェクトは材料にならない。id からパスへ読み替えられず、書き先の
     判定にも使えないので落とす。落としてもガードは緩まない — 観測元そのものを守るガードは、
     保存先の実装が自分で持っている。 */
  const rows = stubs.flatMap((stub) =>
    stub.canonicalPath === null ? [] : [{ id: stub.id, path: stub.canonicalPath }],
  );
  return ok({
    rows,
    roots: rows.map((row) => row.path),
    candidates: stubs
      .filter((stub) => !snapshot.value.watchedIds.has(stub.id))
      .map((stub) => ({
        id: stub.id,
        name: stub.name,
        path: stub.canonicalPath,
        latestActivityMs: stub.latestActivityMs,
      })),
  });
}

/* タブの選択を読む。**結果は選択そのものなので、断りを載せる欄が無い。**
   断りは断りとして投げ、エラーコードから HTTP ステータスを引く側へ渡す。 */
export async function readPreferences(deps: PreferencesDeps): Promise<PreferencesJson> {
  const scope = await observedFrom(deps.index);
  if (!scope.ok) throw scope.error;
  return presentPreferences(
    await deps.read.execute({ observed: scope.value.rows, known: scope.value.rows }),
    scope.value.candidates,
  );
}

/* 操作を置く。**通らなかったことは値で返す。投げない。**

   ここだけは観測ではなく人の操作なので、通ったのか断られたのかを結果に載せる。
   載せずに黙って通ったことにすると、観ると決めたつもりのタブが次に開いたときに消える。 */
export async function writePreferences(
  deps: PreferencesDeps,
  input: unknown,
): Promise<PreferencesResponse> {
  const action = actionOf(input);
  // 形が読めないリクエストは、観測にも保存先にも触らずに断る
  if (!action.ok) return { ok: false, ...presentError(action.error) };

  const scope = await observedFrom(deps.index);
  /* スナップショットを起こせなければ置きに行かない。**書いてよいパスかを判断する材料が
     欠けたまま置くと、観測したプロジェクトの中へ書き込んでしまう。**
     確かめられない側では書かない。 */
  if (!scope.ok) return { ok: false, ...presentError(scope.error) };

  const saved = await deps.write.execute({
    action: action.value,
    observed: scope.value.rows,
    known: scope.value.rows,
    observedRoots: scope.value.roots,
  });
  if (!saved.ok) return { ok: false, ...presentError(saved.error) };
  /* 置いた後の候補は、置く前に起こしたものである。**取り直さない** —— 記録したばかりの
     ディレクトリが候補に残るのは 1 度きりで、次の読み取りで消える。取り直すと、置くたびに
     走査をやり直すことになる。 */
  return { ok: true, body: presentPreferences(saved.value, scope.value.candidates) };
}
