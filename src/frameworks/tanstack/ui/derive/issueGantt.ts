import type { IssueSummaryJson } from '~/interface/presenters/issues/issues.presenter.ts';
import { niceTicks } from '../timeline/axis.ts';
import { DAY_MS } from './timeWindow.ts';

/* 課題の一覧の右に引く時間軸。**観測した時刻しか描かない。**

   GitHub は着手予定日も見積もりも返さないので、計画された日程はどこにも無い。ここに在るのは
   「いつ何が起きたか」という時刻だけで、期間は 1 つも観測できていない。だから軸の上に置くのは
   点であって、長さを持つバーではない。

   このモジュールが決めるのは軸の両端・目盛り・マイルストーンの期日の縦線だけである。行ごとの
   点は `issueEvents.ts` が組む。 */

/** 一度に見る時間の幅。`'all'` は「出ている課題がちょうど収まる幅」 */
export type GanttWindow = 'all' | number;

export const WEEK_MS = 7 * DAY_MS;
export const MONTH_MS = 30 * DAY_MS;
export const QUARTER_MS = 90 * DAY_MS;

/** 課題が 1 件も持たないときに `'all'` が落とす先 */
export const FALLBACK_SPAN_MS = MONTH_MS;

/** これより狭い軸は作らない。両端が同じ時刻の軸には目盛りも点も置けない */
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

const parse = (iso: string | null): number => {
  const atMs = Date.parse(iso ?? '');
  return Number.isFinite(atMs) ? atMs : Number.NaN;
};

export interface GanttAxis {
  readonly t0: number;
  readonly t1: number;
}

/* 未来に渡してよい幅。過ぎた時間と同じだけ —— 軸の半分までが先になる。

   上限を持つのは、`1w` を選んだ人に 1 年先の期日まで見せないためである。ここが無いと、
   誰かが遠い先に付けた期日 1 つで `1w` が 1 年を描き、幅の切り替えが何も意味しなくなる。 */
const AHEAD_RATIO = 1;

/* 軸の右端。現在か、いちばん先のマイルストーンの期日のどちらか遅いほう。

   **現在で切ってはいけない。** 期日は素材の中で唯一先を指す日付なので、まだ来ていない
   から期日である。現在で切ると、締め切りの線は必ず軸の外に落ちて 1 本も描かれない。

   届く範囲より先の期日は軸の外へ落とす。**落としたことは `ganttGuides` の `where` が言う** ——
   幅を広げれば過ぎた時間も伸びるので、遠い期日は広い幅を選べば見える。 */
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

   `'all'` は読める `created_at` のうち最も古いところから始まる。読めるものが 1 件も無いとき、
   そして `created_at` が未来を指していて幅が残らないときは、決まった幅へ落とす。
   **`t1 <= t0` の軸は返さない** — 幅の無い軸に載せると、全部の点が同じ位置へ重なる。 */
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
    const at = parse(issue.created_at);
    if (Number.isFinite(at) && at < oldest) oldest = at;
  }
  if (!Number.isFinite(oldest)) oldest = nowMs - FALLBACK_SPAN_MS;
  const t0 = Math.min(oldest, nowMs - MIN_GANTT_SPAN_MS);
  return { t0, t1: endOf(issues, t0, nowMs) };
}

export interface GanttGuide {
  readonly title: string;
  /** 期日。読めなかったマイルストーンは `null` で、`where` は `'undated'` になる */
  readonly at: number | null;
  /** 軸の中か、左の外か、右の外か、期日そのものが無いか。**外れたものを黙って落とさない** */
  readonly where: 'in' | 'before' | 'after' | 'undated';
}

/* 縦の線。素材の中で唯一先を指す日付である `milestone.due_on` だけを引く。

   読めない日付を 0 として置くと、期日の決まっていないマイルストーンが軸の左端に立つ。だから線には
   しないが、**そのマイルストーンを黙って消しもしない** —— 消すと「期日が無い」と「そんな
   マイルストーンは無い」が同じ絵になる。`'undated'` として返し、呼ぶ側が件数で言う。

   同じ名前は 1 つにまとめる —— 期日は課題 1 件ごとに付いてくるので、同じマイルストーンの
   課題の数だけ同じ線が重なる。読める期日が 1 件でも在れば、そちらを採る。

   軸から外れた期日も返す。**線を引けないことと、期日が無いことは違う** —— 呼ぶ側は
   `where === 'in'` だけを線にして、外れたものは件数として見出しの端に出す。 */
export function ganttGuides(
  issues: readonly IssueSummaryJson[],
  axis: GanttAxis,
): readonly GanttGuide[] {
  const found = new Map<string, number | null>();
  for (const issue of issues) {
    const milestone = issue.github?.milestone ?? null;
    if (milestone === null) continue;
    const at = parse(milestone.due_on);
    const known = found.get(milestone.title);
    if (known !== undefined && (known !== null || !Number.isFinite(at))) continue;
    found.set(milestone.title, Number.isFinite(at) ? at : null);
  }
  return [...found]
    .map(([title, at]) => ({
      title,
      at,
      where:
        at === null
          ? ('undated' as const)
          : at < axis.t0
            ? ('before' as const)
            : at > axis.t1
              ? ('after' as const)
              : ('in' as const),
    }))
    .sort(
      (a, b) =>
        (a.at ?? Number.POSITIVE_INFINITY) - (b.at ?? Number.POSITIVE_INFINITY) ||
        a.title.localeCompare(b.title),
    );
}

/* 軸の上での位置を百分率で。**軸の外は端で止めずに、呼ぶ側が描くのをやめる。**
   端へ寄せた点は、誰も観測していない時刻を指すことになる。 */
export const atPct = (at: number, axis: GanttAxis): number =>
  ((at - axis.t0) / (axis.t1 - axis.t0)) * 100;

export const clampPct = (pct: number): number => Math.min(100, Math.max(0, pct));

/* マイルストーンの期日と現在の縦線。**背景の 1 枚として持つ。**

   行ごとの要素にすると 37 行 × 3 本で 111 個の `<i>` になり、行の継ぎ目で切れた線を繋ぐために
   上下へはみ出させることにもなる。背景なら `.gt` が行の高さいっぱいに在るだけで繋がる。

   位置は割合をグラデーションの色の切り替え点に書く。**`background-position` の百分率にしない**
   —— あちらは(箱 − 画像)に対して解かれるので、1px の線が同じ割合に置いた点から半 px ずれる。 */
export function ganttGridImage(
  guides: readonly GanttGuide[],
  axis: GanttAxis,
  nowMs: number,
): string {
  const line = (pct: number, color: string): string => {
    const at = `${pct}%`;
    const from = `max(0px, calc(${pct}% - 1px))`;
    return `linear-gradient(90deg, transparent ${from}, ${color} ${from}, ${color} ${at}, transparent ${at})`;
  };
  const layers: string[] = [];
  // 現在の線を先に置く。背景は先に書いた層が上に載るので、期日と重なったときこちらが残る
  if (nowMs >= axis.t0 && nowMs <= axis.t1) {
    layers.push(line(atPct(nowMs, axis), 'color-mix(in srgb, var(--active) 42%, transparent)'));
  }
  /* 色は CSS の `--gt-guide` から採る。**ここに書き写さない** —— 凡例の見本も同じ線を
     出しているので、2 か所に書くと片方だけが古い色のまま残る。 */
  for (const guide of guides) {
    if (guide.where !== 'in' || guide.at === null) continue;
    layers.push(line(atPct(guide.at, axis), 'var(--gt-guide)'));
  }
  return layers.length === 0 ? 'none' : layers.join(',');
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
