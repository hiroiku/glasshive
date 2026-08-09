import {
  TAB_SELECTION_VERSION,
  type TabSelection,
} from '~/domain/value-objects/workspace/tab-selection.value-object.ts';

/* 選びを組み替える。ここは純粋で、ディスクにも時計にも触らない。

   **「残す」ことと「出す」ことを分けてある。** 覚えておくのは人が選んだ id で、
   タブに出すのは そのうち いま観測できているものだけ。混ぜると、選びが観測を
   作り出す道ができてしまう。 */

/** 重複を落とす。残すのは先に出てきたほうなので、並びの順は変わらない */
function dedupe(ids: readonly string[]): string[] {
  const seen = new Set<string>();
  const kept: string[] = [];
  for (const id of ids) {
    if (id === '' || seen.has(id)) continue;
    seen.add(id);
    kept.push(id);
  }
  return kept;
}

/* 覚え書きと観測を突き合わせる。

   **突き合わせても選びは減らない。** 一覧から消えた id も `pinned` に残す —
   作業領域は外して後で繋ぎ直されることがあり、そのたびに留め直させるのは
   「自分の机の並び」を毎回崩すことになる。

   **観測を受け取らない。** 受け取れば、いつか誰かがそれで削る。観測に合わせて削ると、
   置き場をひととき読めなかっただけの日に選びが丸ごと消える — ここは純粋で、空の一覧が
   「無い」なのか「見に行けなかった」なのかを知らない。観測は、出す対象を決める
   `visibleTabs` の側でだけ効かせる。

   ここでするのは形を整えることだけ: 重複を落とし、順を保ち、
   `pinned` と `hidden` の食い違いを解く(留めたほうが後の、強い申し出なので勝つ)。 */
export function reconcile(selection: TabSelection): TabSelection {
  const pinned = dedupe(selection.pinned);
  const pinnedIds = new Set(pinned);
  const hidden = dedupe(selection.hidden).filter((id) => !pinnedIds.has(id));
  return {
    version: TAB_SELECTION_VERSION,
    mode: selection.mode,
    pinned,
    hidden,
  };
}

/* タブに出す id。**観測に在るものだけが並ぶ。**

   `pinned` に在っても観測していない id は出さない。出すと、消えた作業領域を指す
   タブが残り、押しても何も無い窓が開く。留めた印そのものは `reconcile` の側に残る。

   `hidden` は一覧を絞るためのもので、タブ行には効かない。タブに何が並ぶかは
   `pinned` だけで決まる。 */
export function visibleTabs(
  selection: TabSelection,
  observedIds: readonly string[],
): readonly string[] {
  const observed = new Set(observedIds);
  return dedupe(selection.pinned).filter((id) => observed.has(id));
}

/** 留める。既に留めてあれば順は変えない。伏せていたなら、その伏せは解ける */
export function pin(selection: TabSelection, id: string): TabSelection {
  if (id === '') return selection;
  return {
    version: TAB_SELECTION_VERSION,
    mode: selection.mode,
    pinned: dedupe([...selection.pinned, id]),
    hidden: dedupe(selection.hidden).filter((hiddenId) => hiddenId !== id),
  };
}

/* 外す。伏せるほうへは移さない。

   外すのは「机の上から下ろす」ことで、「一覧から消す」ことではない。
   ここで伏せると、外したつもりの巣が一覧からも居なくなり、戻し方が分からなくなる。 */
export function unpin(selection: TabSelection, id: string): TabSelection {
  return {
    version: TAB_SELECTION_VERSION,
    mode: selection.mode,
    pinned: dedupe(selection.pinned).filter((pinnedId) => pinnedId !== id),
    hidden: dedupe(selection.hidden),
  };
}

/* 留めたものの並びを変える。落とす先が端をはみ出したら端で丸める。

   **留めていない id は動かせない。** ここで足すと、並べ替えという操作が
   選びを増やすことになる。 */
export function move(selection: TabSelection, id: string, toIndex: number): TabSelection {
  if (!Number.isFinite(toIndex)) return selection;
  const pinned = dedupe(selection.pinned);
  if (!pinned.includes(id)) return selection;
  const rest = pinned.filter((pinnedId) => pinnedId !== id);
  const to = Math.min(Math.max(Math.trunc(toIndex), 0), rest.length);
  rest.splice(to, 0, id);
  return {
    version: TAB_SELECTION_VERSION,
    mode: selection.mode,
    pinned: rest,
    hidden: dedupe(selection.hidden),
  };
}
