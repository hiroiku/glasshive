import { observed, valueOr } from '~/app-kernel/observation.ts';
import { err, ok, type Result } from '~/app-kernel/result.ts';
import type { ViewerPreferencesRepository } from '~/application/ports/repositories/workspace/viewer-preferences.repository.ts';
import {
  documentOf,
  localeOf,
  selectionOf,
} from '~/application/services/workspace/preferences-document.service.ts';
import type { PreferencesView } from '~/application/use-cases/workspace/read-preferences.use-case.ts';
import {
  move,
  pin,
  reconcile,
  unpin,
  visibleTabs,
} from '~/domain/services/workspace/tab-selection.service.ts';
import type { Locale } from '~/domain/value-objects/workspace/locale.value-object.ts';
import {
  DEFAULT_TAB_SELECTION,
  type TabSelection,
} from '~/domain/value-objects/workspace/tab-selection.value-object.ts';

/* タブの選択を組み替える。

   **受けるのは「何をしたいか」ひとつだけである。** 丸ごとの選択を受けて置き換えると、
   求める側が読んでから置くまでの間に別のクライアントが留めたぶんが、黙って消える。
   読む・当てる・置くをここで 1 つの処理に閉じてあるので、その隙が無い。

   置く前に形を整える(`reconcile`)。整えずに置くと、重複や食い違いを抱えた
   `preferences.json` が残り、読むたびに整え直すことになる。観測に合わせて削りはしない —
   一覧から消えた id も、そのまま置く。 */

/** タブへの操作。留める・外す・並べ替えの 3 つだけで、丸ごとの差し替えは受けない */
export type TabAction =
  | { readonly action: 'pin'; readonly id: string }
  | { readonly action: 'unpin'; readonly id: string }
  | { readonly action: 'move'; readonly id: string; readonly toIndex: number };

/* 画面の言葉を選ぶ操作。**`null` は英語ではなく「選ぶのをやめる」である** ——
   選び直せる先が無いと、一度選んだ人はブラウザーの言葉へ戻れなくなる。 */
export type LocaleAction = { readonly action: 'locale'; readonly locale: Locale | null };

export type PreferenceAction = TabAction | LocaleAction;

export interface WritePreferencesInput {
  readonly action: PreferenceAction;
  /** いま観測しているプロジェクトの id。タブに出す対象を返すために要る */
  readonly observedIds: readonly string[];
  /** いま観測しているプロジェクトのパス。**ここへは書かない**ことを確かめるために渡す */
  readonly observedRoots: readonly string[];
}

export interface WritePreferencesUseCase {
  execute(input: WritePreferencesInput): Promise<Result<PreferencesView>>;
}

/** 操作を、いまの選択に当てる。組み替えそのものは domain の純関数がする */
function applied(selection: TabSelection, action: PreferenceAction): TabSelection {
  if (action.action === 'pin') return pin(selection, action.id);
  if (action.action === 'unpin') return unpin(selection, action.id);
  if (action.action === 'move') return move(selection, action.id, action.toIndex);
  return selection;
}

export function createWritePreferences(deps: {
  readonly preferences: ViewerPreferencesRepository;
}): WritePreferencesUseCase {
  return {
    async execute({ action, observedIds, observedRoots }) {
      /* 当てる相手は、いま置いてある `preferences.json` である。求める側が持っている
         コピーではない。コピーに当てて丸ごと置くと、そのコピーを取った後に別のクライアントが
         留めたぶんが消える。 */
      const document = await deps.preferences.load();
      const stored = selectionOf(document);

      /* **読めなかったときは置かない。** 読む側は既定へ倒してよい — 倒しても観測は 1 つも
         欠けず、ピン留めが「留めていない」に見えるだけで、次に読めたときには戻る。置く側は
         違う。倒したコピーに操作を載せて置けば、その推測がそのまま保存され、留めて
         あったものが本当に消える。一時的に読めなかっただけで、留めた一覧を丸ごと捨てる
         ことになる。 */
      if (stored.kind === 'unobservable') return err(stored.error);

      /* 無いのと、読める形になっていないのは倒してよい。捨てると決めてあるので、
         倒しても失うものが無い。 */
      const next = applied(reconcile(valueOr(stored, DEFAULT_TAB_SELECTION)), action);
      /* 触っていないほうを書き戻す。**片方の操作でもう片方を落とさない** ——
         留め直しのたびに選んだ言葉が消えると、選び直したのに戻ったように見える。 */
      const locale = action.action === 'locale' ? action.locale : valueOr(localeOf(document), null);

      const saved = await deps.preferences.save(documentOf(next, locale), {
        observedRoots,
      });
      // 断られた・置けなかったときは、置けた振りをしない。古い `preferences.json` はそのまま残っている
      if (!saved.ok) return err(saved.error);
      return ok({
        selection: next,
        visibleTabs: visibleTabs(next, observedIds),
        locale,
        // いま置いたものが、そのまま `preferences.json` の中身である
        stored: observed(next),
      });
    },
  };
}
