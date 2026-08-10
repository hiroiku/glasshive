/* 読んでよいパスの集合。glasshive が答えてよい範囲そのものである。

   コントローラーが受け取るのはプロジェクトの id と `transcript` のパスだけで、そのどちらも
   ここを通してからでないと使えない。持っているのは実際に観測できたものだけで、
   外から足す手段は無い。

   値だけの不変なオブジェクトである。作れるのは観測した木からだけで、
   誰が何を選んだか(タブの選択)には一切左右されない —
   選択は表示を絞り込むだけで、届く範囲ではない。 */

export interface ReadableScope {
  /** 代表 slug → 実パス */
  readonly projectsById: ReadonlyMap<string, string>;
  /* `transcript` の実パス。**サブエージェントの `transcript` も含める。**

     会話パネルはサブエージェントの `transcript` も開くので、含めないと委譲された仕事の行から
     会話が開けなくなる。 */
  readonly transcriptFiles: ReadonlySet<string>;
}
