import { absent, type Observation, observed } from '~/app-kernel/observation.ts';
import type { Locale } from '~/domain/value-objects/workspace/locale.value-object.ts';
import {
  parsePreferencesDocument,
  serializePreferencesDocument,
} from '~/domain/value-objects/workspace/preferences-document.value-object.ts';
import type { TabSelection } from '~/domain/value-objects/workspace/tab-selection.value-object.ts';

/* `preferences.json` の文字列と、人が選んだものとの間を写す。

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
  const parsed = parsePreferencesDocument(document.value).selection;
  return parsed === undefined ? absent('empty') : observed(parsed);
}

/* 選ばれた画面の言葉。**まだ選んでいないことを、観測できなかったことと分ける** ——
   前者はブラウザーが名乗る言葉へ倒してよく、後者は倒した結果を「その人が選んだ」と
   名乗ってはいけない。 */
export function localeOf(document: Observation<string>): Observation<Locale> {
  if (document.kind !== 'observed') return document;
  const parsed = parsePreferencesDocument(document.value).locale;
  return parsed === undefined ? absent('empty') : observed(parsed);
}

/** 選んだものを、保存先へ預ける文字列にする */
export function documentOf(selection: TabSelection, locale: Locale | null): string {
  return serializePreferencesDocument({ selection, locale });
}
