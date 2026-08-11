import type { IssueSummaryJson } from '~/interface/presenters/issues/issues.presenter.ts';
import { niceTicks } from '../timeline/axis.ts';
import { isClosedStatus } from './issueStatus.ts';
import { DAY_MS } from './timeWindow.ts';

/* 課題の一覧の右に引く時間軸。**観測した時刻しか描かない。**

   GitHub は着手予定日も見積もりも返さないので、計画された日程はどこにも無い。ここで引ける
   のは `created_at` から始まり、閉じたものは `updated_at`、開いているものは現在で終わる 1 本
   だけである。閉じた時刻に `updated_at` を当てるのは `issueFlow.ts` と同じ近似で、閉じた後に
   触られた課題は長く出る。近似であることを画面の側で言い落とさないこと。

   `created_at` を読めなかった課題にはバーが無い。現在で代用すると「いま作られた」という、
   持っていない事実を描くことになる。 */

/** 一度に見る時間の幅。`'all'` は「出ている課題がちょうど収まる幅」 */
export type GanttWindow = 'all' | number;

export const WEEK_MS = 7 * DAY_MS;
export const MONTH_MS = 30 * DAY_MS;
export const QUARTER_MS = 90 * DAY_MS;

/** 課題が 1 件も持たないときに `'all'` が落とす先 */
export const FALLBACK_SPAN_MS = MONTH_MS;

/** これより狭い軸は作らない。両端が同じ時刻の軸には目盛りもバーも置けない */
export const MIN_GANTT_SPAN_MS = DAY_MS;

/* 選べる幅は `derive/timeWindow.ts` の `WINDOWS` とは別の語彙である。**混ぜてはいけない。**

   あちらは `transcript` の稼働区間を測るもので、30m から 7d までしか無い。課題は週や月の
   単位で生きているので、同じ刻みで選ばせると `'all'` 以外がどれも空に見える。同じ時間軸の
   上に在るものではないから、揃える理由も無い。 */
export const GANTT_WINDOWS: readonly {
  readonly key: GanttWindow;
  readonly label: string;
  readonly title: string;
}[] = [
  { key: 'all', label: 'All', title: 'Every issue with a known creation time, in one view' },
  { key: WEEK_MS, label: '1w', title: 'The last 7 days' },
  { key: MONTH_MS, label: '1mo', title: 'The last 30 days' },
  { key: QUARTER_MS, label: '3mo', title: 'The last 90 days' },
];

export const DEFAULT_GANTT_WINDOW: GanttWindow = 'all';

export interface GanttSpan {
  readonly from: number;
  readonly to: number;
  readonly closed: boolean;
}

const parse = (iso: string | null): number => {
  const atMs = Date.parse(iso ?? '');
  return Number.isFinite(atMs) ? atMs : Number.NaN;
};

/* 課題 1 件のバー。読める `created_at` が無ければバーそのものが無い。

   閉じているのに `updated_at` を読めなかったときは、右端を `created_at` に揃えて幅の無い
   バーにする。作られたことは観測できていて、閉じた時刻は観測できていない、という形である。 */
export function ganttSpan(issue: IssueSummaryJson, nowMs: number): GanttSpan | null {
  const from = parse(issue.created_at);
  if (!Number.isFinite(from)) return null;

  const closed = isClosedStatus(issue.status);
  const touched = parse(issue.updated_at);
  const end = closed ? (Number.isFinite(touched) ? touched : from) : nowMs;
  return { from, to: Math.max(end, from), closed };
}

export interface GanttAxis {
  readonly t0: number;
  readonly t1: number;
}

/* 未来に渡してよい幅。過ぎた時間の半分まで —— 軸の 1/3 が先、2/3 が実際に在ったものになる。
   これより広げると、まだ何も起きていない場所に軸を取られて、バーがどれも左の隅へ潰れる。 */
const AHEAD_RATIO = 0.5;

/* 軸の右端。現在か、いちばん先のマイルストーンの期日のどちらか遅いほう。

   **現在で切ってはいけない。** 期日は素材の中で唯一先を指す日付なので、まだ来ていない
   から期日である。現在で切ると、締め切りの線は必ず軸の外に落ちて 1 本も描かれない。

   届く範囲より先の期日は軸の外へ落とす。幅を広げれば過ぎた時間も伸びるので、遠い期日は
   広い幅を選べば見える。 */
function endOf(issues: readonly IssueSummaryJson[], fromMs: number, nowMs: number): number {
  const reach = nowMs + Math.max((nowMs - fromMs) * AHEAD_RATIO, MIN_GANTT_SPAN_MS);
  let latest = nowMs;
  for (const issue of issues) {
    const at = parse(issue.github?.milestone?.due_on ?? null);
    if (Number.isFinite(at) && at > latest && at <= reach) latest = at;
  }
  return latest;
}

/* 軸の両端。決まった幅なら現在から その幅だけ遡り、右は期日まで伸ばす。

   `'all'` はバーを持つ課題のうち最も古い `created_at` から始まる。バーが 1 本も無いとき、
   そして `created_at` が未来を指していて幅が残らないときは、決まった幅へ落とす。
   **`t1 <= t0` の軸は返さない** — 幅の無い軸に載せると、全部のバーが同じ位置へ潰れる。 */
export function ganttAxis(
  issues: readonly IssueSummaryJson[],
  window: GanttWindow,
  nowMs: number,
): GanttAxis {
  if (window !== 'all') {
    const t0 = nowMs - Math.max(window, MIN_GANTT_SPAN_MS);
    return { t0, t1: endOf(issues, t0, nowMs) };
  }

  let oldest = Number.POSITIVE_INFINITY;
  for (const issue of issues) {
    const span = ganttSpan(issue, nowMs);
    if (span !== null && span.from < oldest) oldest = span.from;
  }
  if (!Number.isFinite(oldest)) oldest = nowMs - FALLBACK_SPAN_MS;
  const t0 = Math.min(oldest, nowMs - MIN_GANTT_SPAN_MS);
  return { t0, t1: endOf(issues, t0, nowMs) };
}

export interface GanttGuide {
  readonly title: string;
  readonly at: number;
}

/* 縦のガイド。素材の中で唯一先を指す日付である `milestone.due_on` だけを引く。

   `due_on` が無いマイルストーンからはガイドが出ない。読めない日付を 0 として置くと、
   期日の決まっていない区切りが軸の左端に立つ。同じ名前は 1 本にまとめる —— 期日は課題 1 件
   ごとに付いてくるので、同じマイルストーンの課題の数だけ同じ線が重なる。 */
export function ganttGuides(
  issues: readonly IssueSummaryJson[],
  axis: GanttAxis,
): readonly GanttGuide[] {
  const found = new Map<string, number>();
  for (const issue of issues) {
    const milestone = issue.github?.milestone ?? null;
    if (milestone === null || found.has(milestone.title)) continue;
    const at = parse(milestone.due_on);
    if (!Number.isFinite(at) || at < axis.t0 || at > axis.t1) continue;
    found.set(milestone.title, at);
  }
  return [...found]
    .map(([title, at]) => ({ title, at }))
    .sort((a, b) => a.at - b.at || a.title.localeCompare(b.title));
}

/** 月の刻みで目盛りを置くようになる幅。`niceTicks` の刻みが足りなくなる境目 */
const MONTHLY_FROM_MS = 8 * (7 * DAY_MS);

/** 目盛りの本数の上限。`niceTicks` と同じ */
const MAX_TICKS = 8;

/** 月の刻み。四半期と半年で割り切れる並びにして、目盛りが暦の区切りに乗るようにする */
const MONTH_STEPS: readonly number[] = [1, 2, 3, 6, 12, 24, 60];

/* 目盛りの位置。**`niceTicks` は 8 週までしか刻みを持たない。**

   共有の `niceTicks` は `transcript` の時間軸のもので、いちばん粗い刻みが 7 日である。
   3 か月の軸に当てると 13 本、`'all'` で 1 年を跨ぐと 50 本を超えて、ラベルが読めなくなる。
   そこから先は暦の月の頭へ置く —— 月をまたぐ軸で読みたいのは「何月か」であって、
   起点から 28 日ごとの日付ではない。8 週までは共有の刻みをそのまま使う。 */
export function ganttTicks(t0: number, t1: number): number[] {
  const span = t1 - t0;
  if (span <= 0) return [];
  if (span <= MONTHLY_FROM_MS) return niceTicks(t0, t1);

  const months = span / MONTH_MS;
  const step =
    MONTH_STEPS.find((candidate) => months / candidate <= MAX_TICKS) ?? MONTH_STEPS.at(-1);
  if (step === undefined) return [];

  const start = new Date(t0);
  const index = start.getFullYear() * 12 + start.getMonth();
  const ticks: number[] = [];
  for (let at = Math.ceil(index / step) * step; ; at += step) {
    const tick = new Date(Math.floor(at / 12), at % 12, 1).getTime();
    if (tick > t1) break;
    if (tick >= t0) ticks.push(tick);
  }
  return ticks;
}

/* 目盛りのラベル。`timeline/axis.ts` の `formatTick` と同じく幅で切り替えるが、
   こちらは月の単位の幅まで受ける。日を跨げば日付、年を跨ぐほど広ければ年月にする —
   月の刻みで並んだ目盛りに日付を出しても、どれも 1 日で見分けが付かない。 */
export function formatGanttTick(atMs: number, spanMs: number): string {
  const date = new Date(atMs);
  if (spanMs > 400 * DAY_MS) return `${date.getFullYear()}/${date.getMonth() + 1}`;
  if (spanMs > 2 * DAY_MS) return `${date.getMonth() + 1}/${date.getDate()}`;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
