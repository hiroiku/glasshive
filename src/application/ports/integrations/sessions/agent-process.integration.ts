import type { Observation } from '~/app-kernel/observation.ts';

/* 生きているプロセスを数えるポート。他人のプログラムを起こして、その出力を訳す。

   **失敗を空の並びに潰さない。** 数えられなかったときに 0 件を返すと、待機の枠が
   なくなって、待っているセッションが残らず「終わった」ものとして並ぶ。
   ユーザーには、そのプロジェクトが静まり返っているようにしか見えない。 */

/** 生きているプロセス 1 つ。OS から見えるのは pid と作業ディレクトリだけである */
export interface LiveProcess {
  readonly pid: number;
  /* 作業ディレクトリ。**解決済みのパスを入れること。**

     `lsof -d cwd` も `/proc/<pid>/cwd` も元から解決済みのパスを返すので、
     渡す側は普通それをそのまま入れればよい。 */
  readonly cwd: string;
}

export interface AgentProcessIntegration {
  list(): Promise<Observation<readonly LiveProcess[]>>;
}
