/* 同時に動いていたエージェントの数。純関数。

   各エージェント(セッションと子)の稼働区間を、見せるバケットへ落とし、バケットごとに
   「その間に動いていたエージェントの数」を数える。**同じエージェントの区間が同じバケットに
   何本重なっても 1 と数える。** そうしないと、細かく途切れながら働いた 1 つのエージェントが
   数十に見える。 */

export interface ConcurrencyNode {
  readonly state: string;
  readonly intervals: readonly (readonly [string, string])[];
}

export function concurrency(
  nodes: readonly ConcurrencyNode[],
  fromMs: number,
  footMs: number,
  bars: number,
  nowMs: number,
): number[] {
  const counts = new Array<number>(bars).fill(0);

  for (const node of nodes) {
    const intervals: [number, number][] = [];
    for (const [from, to] of node.intervals) {
      const a = Date.parse(from);
      const b = Date.parse(to);
      if (Number.isFinite(a) && Number.isFinite(b)) intervals.push([a, b]);
    }
    if (intervals.length === 0) continue;
    // 動いている最後の区間は現在まで伸ばす。伸ばさないと、いま働いているエージェントが数から漏れる
    if (node.state === 'active') {
      const last = intervals[intervals.length - 1];
      if (last !== undefined) last[1] = nowMs;
    }

    const touched = new Array<boolean>(bars).fill(false);
    for (const [from, to] of intervals) {
      if (to < fromMs || from > nowMs) continue;
      const first = Math.max(0, Math.floor((from - fromMs) / footMs));
      const last = Math.min(bars - 1, Math.floor((to - fromMs) / footMs));
      for (let bar = first; bar <= last; bar += 1) touched[bar] = true;
    }
    for (let bar = 0; bar < bars; bar += 1)
      if (touched[bar] === true) counts[bar] = (counts[bar] ?? 0) + 1;
  }

  return counts;
}
