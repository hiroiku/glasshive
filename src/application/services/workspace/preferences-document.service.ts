import { absent, type Observation, observed } from '~/app-kernel/observation.ts';
import {
  parseTabSelection,
  serializeTabSelection,
  type TabSelection,
} from '~/domain/value-objects/workspace/tab-selection.value-object.ts';

/* 覚え書きの字と、選びとの間を写す。

   置き場は字を預かって字を返すだけで、その字が何を意味するかを知らない。
   読めるかどうかを決めるのはここである。**読み解きが 1 箇所に在るから、
   置き場を差し替えても読める形が枝分かれしない。**

   読めなかった字は「読めるものが無い」に倒す。版が違う・欄の型が違う・字が壊れている、
   はどれも同じことで、移行も復旧も持たないのでここで捨てる。倒れても観測は 1 つも欠けない。

   **見に行けなかったことは倒さずに通す。** 倒すのと通すのを混ぜると、既定へ倒れた理由が
   消え、「まだ選んでいない」と「読めなかった」が観る人から見分けられなくなる。 */

export function selectionOf(document: Observation<string>): Observation<TabSelection> {
  if (document.kind !== 'observed') return document;
  const parsed = parseTabSelection(document.value);
  return parsed === undefined ? absent('empty') : observed(parsed);
}

/** 選びを、置き場へ預ける字にする */
export function documentOf(selection: TabSelection): string {
  return serializeTabSelection(selection);
}
