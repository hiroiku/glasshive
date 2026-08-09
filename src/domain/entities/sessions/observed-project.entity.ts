import type { Observation } from '~/app-kernel/observation.ts';
import type { TranscriptSession } from './session.entity.ts';

/* 観測できた巣 1 つ。

   同じ実体の巣が複数の名前に分かれることがある(場所の書き表し方の揺れ)。
   実際の場所で 1 つに併せ、代表の名前を 1 つ決める。 */
export interface ObservedProject {
  /** 代表の名前。併せた組の中で辞書順の最も小さいもの */
  readonly id: string;
  /** 併せた元の名前すべて。内側の事情なので、外へは出さない */
  readonly slugs: readonly string[];
  /** 正本に書かれていた作業場所。手を加えない */
  readonly path: string | null;
  /** 併せるための鍵に使った、解決済みの場所 */
  readonly canonicalPath: string | null;
  readonly name: string;
  /** この巣に帰属した、生きている道具の数 */
  readonly liveProcessCount: number;
  readonly sessions: readonly TranscriptSession[];
  readonly latestActivityMs: number;
  /* 直近の窓で使ったトークン。セッションと子の全部を足したもの。

     一覧はこれを列に出す。**巣ごとに問い直さずに済むよう、木を組む一度の歩きで数える。** */
  readonly recentTokens: Observation<number>;
}

/** ひと目ぶんの観測 */
export interface ProjectTree {
  readonly generatedAtMs: number;
  readonly activeThresholdMs: number;
  /* 正本の置き場そのものを歩けたか、そこに名前がいくつ在ったか。

     **まだ 1 つも巣が無い**のと、**置き場を読めなかった**のは別の事実である。
     どちらも空の一覧になるので、分けて持たないと観る人に見分けが付かない。 */
  readonly sources: Observation<number>;
  /* 生きている道具を数えられたか。数えられなかったときも木は返す —
     待機が分からないだけで、セッションそのものは見えているからである。 */
  readonly processes: Observation<number>;
  readonly projects: readonly ObservedProject[];
}
