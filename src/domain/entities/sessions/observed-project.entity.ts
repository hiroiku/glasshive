import type { Observation } from '~/app-kernel/observation.ts';
import type { TranscriptSession } from './session.entity.ts';

/* 観測できたプロジェクト 1 つ。

   同一のプロジェクトが複数の slug に分かれることがある(パスの書き表し方の揺れ)。
   実際のパスで 1 つにまとめ、代表の slug を 1 つ決める。 */
export interface ObservedProject {
  /** 代表の slug。まとめた組の中で辞書順の最も小さいもの */
  readonly id: string;
  /** まとめた元の slug すべて。内側の事情なので、外へは出さない */
  readonly slugs: readonly string[];
  /** `transcript` に書かれていた作業ディレクトリ。手を加えない */
  readonly path: string | null;
  /** まとめるためのキーに使った、解決済みのパス */
  readonly canonicalPath: string | null;
  readonly name: string;
  /** このプロジェクトに帰属した、生きているプロセスの数 */
  readonly liveProcessCount: number;
  readonly sessions: readonly TranscriptSession[];
  readonly latestActivityMs: number;
  /* 直近の対象期間に使ったトークン。セッションとサブエージェントの全部を足したもの。

     一覧はこれを列に出す。**プロジェクトごとに問い直さずに済むよう、木を組む一度の走査で数える。** */
  readonly recentTokens: Observation<number>;
  /* このプロジェクトの `transcript` を数え上げられたか。数え上げられたなら、そこに見えた数。

     **`sessions` が短くなる理由は 2 つある。** 本当にそれだけしか無いのと、ディレクトリを
     走査できなかったか見えた `transcript` を全部は載せられなかったのである。
     一覧の長さだけでは、その 2 つが同じ形になる。 */
  readonly walked: Observation<number>;
}

/* 中身を読む前のプロジェクト 1 つ。**行の識別だけが決まっている。**

   ここに在る値はどれも、一覧全体を見ないと決まらない。`id` と名前は同じ解決済みパスを持つ
   slug を束ねた組の代表で決まり、`liveProcessCount` は一覧の中で最も深いプロジェクトを
   選んだ結果である。だから読み終えたプロジェクトから順に出すのではなく、これを先に
   全部そろえてから配る。**そうしないと、行が後から改名も併合も消滅もする。** */
export interface ProjectStub {
  readonly id: string;
  readonly slugs: readonly string[];
  readonly path: string | null;
  readonly canonicalPath: string | null;
  readonly name: string;
  readonly liveProcessCount: number;
  readonly latestActivityMs: number;
  /* このプロジェクトが持つ `transcript` の数。セッションと子を合わせる。

     読み終えた数を数えるときの分母である。**バイト数は分母にしない** — `transcript` には
     読み取り範囲の上限が掛かっているので、大きいファイルではごく一部しか読まず、小さい
     ファイルでは読み取り範囲どうしが重なって、大きさより多く読むことになる。 */
  readonly transcriptCount: number;
  /* このプロジェクトの `transcript` を数え上げられたか。数え上げられたなら、そこに見えた数。

     **数え上げられなかった行は `transcriptCount` が 0 になる。** 読むものが無いのではなく、
     何本あるかを数えられなかったのであって、その区別はこの欄にしか残らない。 */
  readonly walked: Observation<number>;
}

/* 中身を読む前の一覧。何が並ぶかだけが決まっていて、1 行ごとの数値はまだ無い。 */
export interface ProjectIndex {
  readonly generatedAtMs: number;
  readonly activeThresholdMs: number;
  readonly sources: Observation<number>;
  readonly processes: Observation<number>;
  readonly stubs: readonly ProjectStub[];
}

/** ある時点で観測したプロジェクトぜんぶ */
export interface ProjectTree {
  readonly generatedAtMs: number;
  readonly activeThresholdMs: number;
  /* `~/.claude/projects` を走査できたか、そこにディレクトリがいくつあったか。

     **プロジェクトが 1 つも無いことと、走査できなかったことは別の事実である。**
     どちらも空の一覧になるので、分けて持たないとユーザーには見分けが付かない。 */
  readonly sources: Observation<number>;
  /* 生きているプロセスを数えられたか。数えられなかったときも木は返す —
     待機が分からないだけで、セッションそのものは観測できているからである。 */
  readonly processes: Observation<number>;
  readonly projects: readonly ObservedProject[];
}
