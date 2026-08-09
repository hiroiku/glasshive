import type { Observation } from '~/app-kernel/observation.ts';

/* 生きている道具を数える口。他人のプログラムを起こして、その答えを訳す。

   **失敗を空の並びに潰さない。** 数えられなかったときに 0 件を返すと、待機の枠が
   なくなって、待っているセッションが残らず「終わった」ものとして並ぶ。
   観る人には、その巣が静まり返っているようにしか見えない。 */

/** 生きている道具 1 つ。OS から見えるのは番号と作業場所だけである */
export interface LiveProcess {
  readonly pid: number;
  /* 作業場所。**解決済みの場所を入れること。**

     `lsof -d cwd` も `/proc/<pid>/cwd` も元から解決済みの場所を返すので、
     渡す側は普通それをそのまま入れればよい。 */
  readonly cwd: string;
}

export interface AgentProcessIntegration {
  list(): Promise<Observation<readonly LiveProcess[]>>;
}
