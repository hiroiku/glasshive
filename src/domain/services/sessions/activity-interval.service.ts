import {
  type ActivityInterval,
  type ActivityIntervalSet,
  GAP_MS,
  MAX_INTERVALS,
} from '~/domain/value-objects/sessions/activity-interval.value-object.ts';

/* 稼働区間を、`transcript` のテキストから導く。ここはディスクに触らない。

   `transcript` には 1 イベントごとの時刻しか残らないので、区間は「近い時刻どうしを繋ぐ」
   ことで作る。渡ってくるのは `transcript` の末尾だけということがあり、先頭まで読めたかを
   知っているのは読んだ側だけなので、`complete` は受け取ってそのまま持ち帰る。 */

/* 時刻を拾う。**パースせず、テキストをそのまま走査する。**

   `transcript` の 1 行は入れ子になっていて、時刻は行の本体にも、その中に抱えた記録にも
   書かれる。行としてパースすると外側の 1 つしか拾えないので、テキストをそのまま探して
   全部を拾う。壊れた行や読めない文字が混じっても、その 1 つを落とすだけで先へ進める。 */
export function extractTimestampsMs(text: string): number[] {
  // /g の正規表現は当てた位置を覚える。外に置くと抜け方次第で次の呼び出しに位置が渡るので、呼ぶたびに作る
  const pattern = /"timestamp":"([^"]+)"/g;
  const found: number[] = [];
  let match = pattern.exec(text);
  while (match !== null) {
    const parsed = Date.parse(match[1] ?? '');
    if (Number.isFinite(parsed)) found.push(parsed);
    match = pattern.exec(text);
  }
  return found;
}

/** まとめている途中の区間。出来上がりは読み取り専用なので、途中だけ書き換えられる形を使う */
interface MutableInterval {
  fromMs: number;
  toMs: number;
}

/* 近い時刻どうしを繋いで稼働区間にする。

   渡す並びは順不同でよい。時刻の前後は書かれた順ではなく数で決まるので、
   まず昇順に並べ替えてから繋ぐ。 */
export function clusterIntervals(
  timestampsMs: readonly number[],
  options?: { readonly gapMs?: number; readonly max?: number },
): ActivityInterval[] {
  const gapMs = options?.gapMs ?? GAP_MS;
  const max = options?.max ?? MAX_INTERVALS;

  const sorted = [...timestampsMs].sort((a, b) => a - b);
  let intervals: MutableInterval[] = [];
  for (const timestampMs of sorted) {
    const last = intervals[intervals.length - 1];
    // 幅ちょうどの無音はまだ同じ区間として繋ぐ。境目は「以下」で切る
    if (last && timestampMs - last.toMs <= gapMs) last.toMs = Math.max(last.toMs, timestampMs);
    else intervals.push({ fromMs: timestampMs, toMs: timestampMs });
  }

  /* 区間が多すぎるうちは、繋ぐ幅を倍にしてまとめ直す。
     1 度広げれば収まるとは限らないので、収まるか、これ以上まとめられなくなるまで繰り返す。 */
  let gap = gapMs;
  while (intervals.length > max && intervals.length > 1) {
    const widened = gap * 2;
    // 幅が広がらないなら、何度まとめ直しても数は減らない
    if (!(widened > gap)) break;
    gap = widened;
    const merged: MutableInterval[] = [];
    for (const interval of intervals) {
      const last = merged[merged.length - 1];
      if (last && interval.fromMs - last.toMs <= gap)
        last.toMs = Math.max(last.toMs, interval.toMs);
      else merged.push({ fromMs: interval.fromMs, toMs: interval.toMs });
    }
    intervals = merged;
  }
  return intervals;
}

/** 拾ってまとめるところまで。`complete` は読んだ側から受け取って、そのまま持ち帰る */
export function deriveActivity(
  text: string,
  complete: boolean,
  options?: { readonly gapMs?: number; readonly max?: number },
): ActivityIntervalSet {
  return {
    intervals: clusterIntervals(extractTimestampsMs(text), options),
    complete,
  };
}
