import { observed, valueOr } from '~/app-kernel/observation.ts';
import { err, ok, type Result } from '~/app-kernel/result.ts';
import type { ViewerPreferencesRepository } from '~/application/ports/repositories/workspace/viewer-preferences.repository.ts';
import {
  documentOf,
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
import {
  DEFAULT_TAB_SELECTION,
  type TabSelection,
} from '~/domain/value-objects/workspace/tab-selection.value-object.ts';

/* 選びを組み替える。

   **受けるのは「何をしたいか」ひとつだけである。** 丸ごとの選びを受けて置き換えると、
   求める側が読んでから置くまでの間に別の窓が留めたぶんが、黙って消える。
   読む・当てる・置くをここで 1 つの行いに閉じてあるので、その隙が無い。

   置く前に形を整える(`reconcile`)。整えずに置くと、重複や食い違いを抱えた覚え書きが
   残り、読むたびに整え直すことになる。**観測に合わせて削りはしない** —
   一覧から消えた id も、そのまま置く。 */

/** 観る人の申し出。留める・外す・並べ替えの 3 つだけで、丸ごとの差し替えは受けない */
export type TabAction =
  | { readonly action: 'pin'; readonly id: string }
  | { readonly action: 'unpin'; readonly id: string }
  | { readonly action: 'move'; readonly id: string; readonly toIndex: number };

export interface WritePreferencesInput {
  readonly action: TabAction;
  /** いま観測している巣の id。タブに出す対象を返すために要る */
  readonly observedIds: readonly string[];
  /** いま観測している巣の場所。**ここへは書かない**ことを確かめるために渡す */
  readonly observedRoots: readonly string[];
}

export interface WritePreferencesUseCase {
  execute(input: WritePreferencesInput): Promise<Result<PreferencesView>>;
}

/** 申し出を、いまの選びに当てる。組み替えそのものは domain の純関数がする */
function applied(selection: TabSelection, action: TabAction): TabSelection {
  if (action.action === 'pin') return pin(selection, action.id);
  if (action.action === 'unpin') return unpin(selection, action.id);
  return move(selection, action.id, action.toIndex);
}

export function createWritePreferences(deps: {
  readonly preferences: ViewerPreferencesRepository;
}): WritePreferencesUseCase {
  return {
    async execute({ action, observedIds, observedRoots }) {
      /* 当てる相手は、いま置いてある覚え書きである。求める側が持っている写しではない。
         写しに当てて丸ごと置くと、その写しを取った後に別の窓が留めたぶんが消える。 */
      const stored = selectionOf(await deps.preferences.load());

      /* **読めなかった日は置かない。** 読む側は既定へ倒してよい — 倒しても観測は 1 つも
         欠けず、印が「留めていない」に見えるだけで、次に読めた日には戻る。置く側は違う。
         倒した写しに申し出を載せて置けば、そこで推し量りが正本になり、留めてあったものが
         本当に消える。ひととき読めなかっただけの日に、机を丸ごと捨てることになる。 */
      if (stored.kind === 'unobservable') return err(stored.error);

      /* 無いのと、読める形になっていないのは倒してよい。捨てると決めてあるので、
         倒しても失うものが無い。 */
      const next = applied(reconcile(valueOr(stored, DEFAULT_TAB_SELECTION)), action);

      const saved = await deps.preferences.save(documentOf(next), {
        observedRoots,
      });
      // 断られた・置けなかったときは、置けた振りをしない。古い覚え書きはそのまま残っている
      if (!saved.ok) return err(saved.error);
      return ok({
        selection: next,
        visibleTabs: visibleTabs(next, observedIds),
        // いま置いたものが、そのまま覚え書きの中身である
        stored: observed(next),
      });
    },
  };
}
