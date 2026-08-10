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
