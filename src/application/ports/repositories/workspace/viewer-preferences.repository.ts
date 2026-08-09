import type { Observation } from '~/app-kernel/observation.ts';
import type { Result } from '~/app-kernel/result.ts';

/* 手元の覚え書きを読み書きする口。

   **この道具で `save` を持つ唯一の口である。** 観測元へは何一つ書かない、という決めを
   守れるのは、書く道がここ 1 本しかないからである。増やすときは、その決めを
   もう一度確かめること。

   遣り取りするのは覚え書きの生の字だけである。**向こう側は字の意味を知らない。**
   置き場は字を預かって字を返す棚でしかなく、その字が選びとして読めるかを決めるのは
   こちら側(application)の仕事である。読み解きを向こうへ渡すと、置き場の実装ごとに
   読める形が枝分かれし、どれが本当の形なのかが誰にも言えなくなる。

   `load` は `Observation` を返す。**覚え書きが無いのと、読みに行けなかったのは別の事実**で、
   どちらも「留めたものが無い」ように見えてしまうからである。どちらも既定へ倒れるが、
   なぜ倒れたのかは値として残る。 */

export interface ViewerPreferencesRepository {
  /** 覚え書きがまだ無ければ `absent`。読みに行けなかったときは `unobservable` */
  load(): Promise<Observation<string>>;

  /* 置く。書き先が読みに行く先の中なら断る。

     `observedRoots` に「いま観測している巣の場所」を渡させているのは、その巣の中で
     実際に読む材料へ書かないためである。**書いてよいかの判定を呼ぶ側に任せない** —
     判定は実装の側に焼き込んであり、渡された場所はその材料でしかない。

     **正本の置き場は渡さなくてよい。** 家の `~/.claude` も、環境変数で移した先も、
     実装が自分で見張る。渡させると、渡し忘れがそのまま穴になる。

     断りも書き損ねも `Result` の `err` で返る。投げない。 */
  save(
    document: string,
    context: { readonly observedRoots: readonly string[] },
  ): Promise<Result<void>>;
}
