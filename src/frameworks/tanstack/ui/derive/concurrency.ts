import type { ObservationState } from '~/interface/presenters/sessions/tree.presenter.ts';

/* 同時に動いていたエージェントの数。純関数。

   各エージェント(セッションと子)の稼働区間を、見せるバケットへ落とし、バケットごとに
   「その間に動いていたエージェントの数」を数える。**同じエージェントの区間が同じバケットに
   何本重なっても 1 と数える。** そうしないと、細かく途切れながら働いた 1 つのエージェントが
   数十に見える。 */

export interface ConcurrencyNode {
  readonly state: string;
  /** `transcript` に書かれていた開始時刻の表記 */
  readonly started: string | null;
  readonly last_activity: string;
  readonly intervals: readonly (readonly [string, string])[];
  /** 稼働区間が空のとき、静かだったのか観測できなかったのかを分ける */
  readonly intervals_state: ObservationState;
}

const atMs = (iso: string | null): number | null => {
  const parsed = Date.parse(iso ?? '');
  return Number.isFinite(parsed) ? parsed : null;
};

/* 稼働を観測できなかったエージェントに引く幅。起点から最後の動きまで。

   ここで分からないのは稼働の濃さだけで、その間に `transcript` が在ったことは索引から分かっている。

   起点が時刻として読めないときは最後の動きへ落とす。`axis.ts` の `intervalsOf` も同じ落とし方を
   するので、同じ node について片方だけが空を返して、そのエージェントが画面から黙って消えることが無い。 */
export function unreadSpanOf(node: {
  readonly started: string | null;
  readonly last_activity: string;
}): [number, number] | null {
  const started = atMs(node.started) ?? atMs(node.last_activity);
  if (started === null) return null;
  const ended = atMs(node.last_activity);
  return [started, ended === null ? started : Math.max(ended, started)];
}

const parsedIntervalsOf = (node: ConcurrencyNode): [number, number][] => {
  const intervals: [number, number][] = [];
  for (const [from, to] of node.intervals) {
    const a = Date.parse(from);
    const b = Date.parse(to);
    if (Number.isFinite(a) && Number.isFinite(b)) intervals.push([a, b]);
  }
  return intervals;
};

/** 稼働区間が掛かる足を `true` にする。同じ足に何本重なっても、その足は 1 つである */
const touch = (
  intervals: readonly (readonly [number, number])[],
  fromMs: number,
  footMs: number,
  bars: number,
  nowMs: number,
): boolean[] => {
  const touched = new Array<boolean>(bars).fill(false);
  for (const [from, to] of intervals) {
    if (to < fromMs || from > nowMs) continue;
    const first = Math.max(0, Math.floor((from - fromMs) / footMs));
    const last = Math.min(bars - 1, Math.floor((to - fromMs) / footMs));
    for (let bar = first; bar <= last; bar += 1) touched[bar] = true;
  }
  return touched;
};

export function concurrency(
  nodes: readonly ConcurrencyNode[],
  fromMs: number,
  footMs: number,
  bars: number,
  nowMs: number,
): number[] {
  const counts = new Array<number>(bars).fill(0);

  for (const node of nodes) {
    const intervals = parsedIntervalsOf(node);
    if (intervals.length === 0) continue;
    // 動いている最後の区間は現在まで伸ばす。伸ばさないと、いま働いているエージェントが数から漏れる
    if (node.state === 'active') {
      const last = intervals[intervals.length - 1];
      if (last !== undefined) last[1] = nowMs;
    }

    const touched = touch(intervals, fromMs, footMs, bars, nowMs);
    for (let bar = 0; bar < bars; bar += 1)
      if (touched[bar] === true) counts[bar] = (counts[bar] ?? 0) + 1;
  }

  return counts;
}

/* 稼働を観測できなかったエージェントの数。足ごとに、`concurrency` とは別に数える。

   **同じ数に足さない。** 足せば読めなかったことが動いていたことになり、落とせば読めなかった
   ことが静かだったことになる。どちらも観測していないものを断定するので、別の数として返して、
   描く側が「読めた数」と「分からない数」を描き分けられるようにする。

   掛かる足は起点から最後の動きまでで取る。ここで分からないのは稼働の濃さだけで、
   その間に `transcript` が在ったことは索引から分かっている。 */
export function unobservableConcurrency(
  nodes: readonly ConcurrencyNode[],
  fromMs: number,
  footMs: number,
  bars: number,
  nowMs: number,
): number[] {
  const counts = new Array<number>(bars).fill(0);

  for (const node of nodes) {
    if (node.intervals_state !== 'unobservable') continue;
    // 1 本でも読めていれば、その分は `concurrency` が数える
    if (parsedIntervalsOf(node).length > 0) continue;
    const span = unreadSpanOf(node);
    if (span === null) continue;

    const touched = touch([span], fromMs, footMs, bars, nowMs);
    for (let bar = 0; bar < bars; bar += 1)
      if (touched[bar] === true) counts[bar] = (counts[bar] ?? 0) + 1;
  }

  return counts;
}
