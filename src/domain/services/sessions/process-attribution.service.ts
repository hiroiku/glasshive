import { containsPath, pathDepth } from '~/app-kernel/path.ts';
import type { AgentProcess } from '~/domain/value-objects/sessions/agent-process.value-object.ts';

/* 生きている道具を、巣へ割り振る。

   **1 つの道具は 1 つの巣にしか数えない。** 祖先にも子孫にも波及させると、
   home で動く 1 つの道具が、その配下の巣を残らず生きているように見せてしまう。
   だから作業場所を含む巣のうち、最も深いものだけを選ぶ。

   含むかと深さは同じ一つの決め方の両輪なので、どちらも app-kernel の側に
   任せる。片方だけが字面を畳むと、浅い巣が深いことになって選び方が壊れる。 */

/** 巣ごとの、帰属した道具の数。返す並びは projectPaths と同じ順・同じ長さ */
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
