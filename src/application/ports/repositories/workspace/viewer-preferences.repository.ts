import type { Observation } from '~/app-kernel/observation.ts';
import type { Result } from '~/app-kernel/result.ts';

/* ローカルの `preferences.json` を読み書きするポート。

   glasshive で `save` を持つ唯一のポートである。観測元へは何一つ書かない、という決め事を
   守れるのは、書き込みの経路がここ 1 本しかないからである。増やすときは、その決め事を
   もう一度確かめること。

   遣り取りするのは `preferences.json` の生の文字列だけで、向こう側はその意味を知らない。
   保存先は文字列を預かって文字列を返すだけで、それがタブの選択として読めるかを決めるのは
   こちら側(application)の仕事である。パースを向こうへ渡すと、保存先の実装ごとに
   読める形が枝分かれし、どれが本当の形なのかが誰にも言えなくなる。

   `load` は `Observation` を返す。**`preferences.json` が無いことと、観測できなかったことは
   別の事実である** — どちらも「留めたものが無い」ように見えてしまう。どちらも既定へ倒れるが、
   なぜ倒れたのかは値として残る。 */

export interface ViewerPreferencesRepository {
  /** `preferences.json` がまだ無ければ `absent`。観測できなかったときは `unobservable` */
  load(): Promise<Observation<string>>;

  /* 置く。書き先が読みに行く先の中なら断る。

     `observedRoots` に「いま観測しているプロジェクトのパス」を渡させているのは、その
     プロジェクトの中で実際に読む材料へ書かないためである。**書いてよいかの判定を呼ぶ側に
     任せない** — 判定は実装の側に焼き込んであり、渡されたパスはその材料でしかない。

     `transcript` のルートは渡さなくてよい。`~` の下の `~/.claude` も、環境変数で移した
     先も、実装が自分でガードする。渡させると、渡し忘れがそのまま穴になる。

     断りも書き損ねも `Result` の `err` で返る。投げない。 */
  save(
    document: string,
    context: { readonly observedRoots: readonly string[] },
  ): Promise<Result<void>>;
}
