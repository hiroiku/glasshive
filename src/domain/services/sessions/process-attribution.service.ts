import { containsPath, pathDepth } from '~/app-kernel/path.ts';
import type { AgentProcess } from '~/domain/value-objects/sessions/agent-process.value-object.ts';

/* 生きているプロセスを、プロジェクトへ割り振る。

   **1 つのプロセスは 1 つのプロジェクトにしか数えない。** 祖先にも子孫にも波及させると、
   `~` で動く 1 つのプロセスが、その配下のプロジェクトを残らず生きているように見せてしまう。
   だから作業ディレクトリを含むプロジェクトのうち、最も深いものだけを選ぶ。

   含むかどうかと深さは同じ決め方の両輪なので、どちらも `app-kernel` に任せる。
   片方だけがパスを正規化すると、浅いプロジェクトが深いことになって選び方が壊れる。 */

/** プロジェクトごとの、帰属したプロセスの数。返す並びは projectPaths と同じ順・同じ長さ */
export function attributeProcesses(
  projectPaths: readonly (string | null)[],
  processes: readonly AgentProcess[],
): readonly number[] {
  const counts = projectPaths.map(() => 0);
  for (const process of processes) {
    let best = -1;
    let bestDepth = -1;
    projectPaths.forEach((projectPath, index) => {
      if (projectPath === null) return;
      if (!containsPath(projectPath, process.cwd)) return;
      const depth = pathDepth(projectPath);
      // 同じ深さで並んだときは先に見つけたものを残す。選び直す理由が無い
      if (depth > bestDepth) {
        best = index;
        bestDepth = depth;
      }
    });
    if (best >= 0) counts[best] = (counts[best] ?? 0) + 1;
  }
  return counts;
}
