import { absent, type Observation, observed } from '~/app-kernel/observation.ts';
import {
  parseTabSelection,
  serializeTabSelection,
  type TabSelection,
} from '~/domain/value-objects/workspace/tab-selection.value-object.ts';

/* `preferences.json` の文字列と、タブの選択との間を写す。

   保存先は文字列を預かって文字列を返すだけで、それが何を意味するかを知らない。
   読めるかどうかを決めるのはここである。パースが 1 箇所に在るから、保存先を
   差し替えても読める形が枝分かれしない。

   読めなかった文字列は「読めるものが無い」に倒す。バージョンが違う・欄の型が違う・文字列が
   壊れている、はどれも同じことで、移行も復旧も持たないのでここで捨てる。倒れても
   観測は 1 つも欠けない。

   **観測できなかったことは倒さずに通す。** 倒すのと通すのを混ぜると、既定へ倒れた理由が
   消え、「まだ選んでいない」と「観測できなかった」がユーザーから見分けられなくなる。 */

export function selectionOf(document: Observation<string>): Observation<TabSelection> {
  if (document.kind !== 'observed') return document;
  const parsed = parseTabSelection(document.value);
  return parsed === undefined ? absent('empty') : observed(parsed);
}

/** タブの選択を、保存先へ預ける文字列にする */
export function documentOf(selection: TabSelection): string {
  return serializeTabSelection(selection);
}
