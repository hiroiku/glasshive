/* 読んでよい場所。この道具が答えてよい範囲そのものである。

   窓が受け取るのは巣の id と正本の場所だけで、そのどちらもここを通してからでないと
   使えない。持っているのは実際に観測できたものだけで、外から足す道は無い。

   値だけの不変な塊である。作れるのは観測した木からだけで、
   誰が何を選んだか(タブの選び)には一切左右されない —
   選びは見せる絞りであって、届く範囲ではない。 */

export interface ReadableScope {
  /** 代表 slug → 実パス */
  readonly projectsById: ReadonlyMap<string, string>;
  /* 正本の実パス。**子の正本も含める。**

     会話の窓は子の正本も開くので、含めないと委譲された仕事の行から会話が開けなくなる。 */
  readonly transcriptFiles: ReadonlySet<string>;
}
