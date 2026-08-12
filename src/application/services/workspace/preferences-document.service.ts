import { absent, type Observation, observed } from '~/app-kernel/observation.ts';
import type { ObservedProjectRef } from '~/domain/services/workspace/watched-projects.service.ts';
import type { Locale } from '~/domain/value-objects/workspace/locale.value-object.ts';
import {
  parsePreferencesDocument,
  serializePreferencesDocument,
} from '~/domain/value-objects/workspace/preferences-document.value-object.ts';
import {
  WATCHED_PROJECTS_VERSION,
  type WatchedProjects,
} from '~/domain/value-objects/workspace/watched-projects.value-object.ts';

/* `preferences.json` の文字列と、人が決めたものとの間を写す。

   保存先は文字列を預かって文字列を返すだけで、それが何を意味するかを知らない。
   読めるかどうかを決めるのはここである。パースが 1 箇所に在るから、保存先を
   差し替えても読める形が枝分かれしない。

   読めなかった文字列は「読めるものが無い」に倒す。欄の型が違う・文字列が壊れている、は
   どれも同じことで、ここで捨てる。倒れても観測は 1 つも欠けない。

   **観測できなかったことは倒さずに通す。** 倒すのと通すのを混ぜると、既定へ倒れた理由が
   消え、「まだ何も決めていない」と「観測できなかった」がユーザーから見分けられなくなる。 */

/* 記録を読む。**1 つ前の形は、読める id だけ引き継ぐ。**

   前の形が持っているのはプロジェクトの id で、パスではない。id からパスは決まらないので、
   見つけたものの中に同じ id が居るときだけ読み替えられる。読み替えられなかったぶんは、
   そのプロジェクトが `~/.claude/projects` から消えているということである。 */
export function watchedOf(
  document: Observation<string>,
  known: readonly ObservedProjectRef[] = [],
): Observation<WatchedProjects> {
  if (document.kind !== 'observed') return document;
  const parsed = parsePreferencesDocument(document.value);
  if (parsed.watched !== undefined) return observed(parsed.watched);
  if (parsed.pinnedIds === undefined) return absent('empty');
  return observed({
    version: WATCHED_PROJECTS_VERSION,
    paths: parsed.pinnedIds.flatMap((id) => {
      const found = known.find((project) => project.id === id);
      return found === undefined ? [] : [found.path];
    }),
  });
}

/* 1 つ前の形に留めてあった id。読めなければ 1 つも無い。

   **読み替えずに渡す。** id からパスは決まらないので、パスを持っている側と突き合わせられない
   場面では、id は id のまま運ぶしかない。 */
export function pinnedIdsOf(document: Observation<string>): readonly string[] {
  if (document.kind !== 'observed') return [];
  return parsePreferencesDocument(document.value).pinnedIds ?? [];
}

/* 選ばれた画面の言葉。**まだ選んでいないことを、観測できなかったことと分ける** ——
   前者はブラウザーが名乗る言葉へ倒してよく、後者は倒した結果を「その人が選んだ」と
   名乗ってはいけない。 */
export function localeOf(document: Observation<string>): Observation<Locale> {
  if (document.kind !== 'observed') return document;
  const parsed = parsePreferencesDocument(document.value).locale;
  return parsed === undefined ? absent('empty') : observed(parsed);
}

/** 決めたものを、保存先へ預ける文字列にする */
export function documentOf(watched: WatchedProjects, locale: Locale | null): string {
  return serializePreferencesDocument({ watched, locale });
}
