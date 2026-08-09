/* 時間の軸。**純関数だけ。**

   軸の取り方は「どの帯が読めるか」を決めてしまうので、ここが狂うと画面全体が嘘になる。
   だから描画から切り離し、値だけで確かめられるようにしてある。 */

/** 軸を引くのに要る、エージェント 1 つぶんの姿 */
export interface TimelineNode {
  readonly state: string;
  /** 正本に書かれていた起点の字面 */
  readonly started: string | null;
  readonly last_activity: string;
  readonly intervals: readonly (readonly [string, string])[];
}

export type Scale = 'auto' | number;

export const SCALES: readonly {
  readonly key: Scale;
  readonly label: string;
}[] = [
  { key: 'auto', label: 'Auto' },
  { key: 15 * 60_000, label: '15m' },
  { key: 60 * 60_000, label: '1h' },
  { key: 6 * 3_600_000, label: '6h' },
  { key: 24 * 3_600_000, label: '24h' },
  { key: 7 * 86_400_000, label: '7d' },
];

/** Auto が遡る上限。これより古い帯に軸を引き伸ばされると、いま動いている帯が潰れる */
const AUTO_SPAN_MS = 24 * 3_600_000;

/** これより狭い窓は作らない。1 分未満の軸には目盛りが置けない */
const MIN_SPAN_MS = 60_000;

export interface Axis {
  readonly t0: number;
  readonly t1: number;
}

const parse = (iso: string | null): number => {
  const atMs = Date.parse(iso ?? '');
  return Number.isFinite(atMs) ? atMs : Number.NaN;
};

/* 帯を数の組にする。稼働中の最後の帯は現在まで伸ばす。

   帯が 1 つも読めなかったときは、起点と最後の動きで 1 本引く。**空にはしない** —
   空にすると、帯を拾えなかったエージェントが画面から消える。 */
export function intervalsOf(node: TimelineNode, nowMs: number): [number, number][] {
  const parsed: [number, number][] = [];
  for (const [from, to] of node.intervals) {
    const a = parse(from);
    const b = parse(to);
    if (Number.isFinite(a) && Number.isFinite(b)) parsed.push([a, b]);
  }
  if (parsed.length === 0) {
    const started = parse(node.started) || parse(node.last_activity);
    if (!Number.isFinite(started)) return [];
    const ended = node.state === 'active' ? nowMs : parse(node.last_activity) || started;
    parsed.push([started, ended]);
  }
  if (node.state === 'active') {
    const last = parsed[parsed.length - 1];
    if (last !== undefined) last[1] = nowMs;
  }
  return parsed;
}

/* 軸の両端を決める。

   Auto は**動いているエージェントの実際の帯だけ**で決める。終わったものまで含めると、
   1 週間前に終わったセッションが軸を引き伸ばし、いま動いている帯が 1 本の線に潰れる。

   全員終わっているときだけ全行に広げる。そうしないと軸そのものが空になる。 */
export function axisOf(nodes: readonly TimelineNode[], scale: Scale, nowMs: number): Axis {
  let t0 = Number.POSITIVE_INFINITY;
  let t1 = 0;

  const feed = (node: TimelineNode, actualOnly: boolean): void => {
    if (actualOnly && node.intervals.length > 0) {
      for (const [from, to] of node.intervals) {
        const a = parse(from);
        const b = parse(to);
        if (Number.isFinite(a) && a < t0) t0 = a;
        if (Number.isFinite(b) && b > t1) t1 = b;
      }
    } else {
      const started = parse(node.started) || parse(node.last_activity) || nowMs;
      const ended = parse(node.last_activity) || started;
      if (started < t0) t0 = started;
      if (ended > t1) t1 = ended;
    }
    if (node.state === 'active' && nowMs > t1) t1 = nowMs;
  };

  if (scale === 'auto') {
    for (const node of nodes) if (node.state !== 'ended') feed(node, true);
  }
  if (!Number.isFinite(t0)) for (const node of nodes) feed(node, false);
  if (!Number.isFinite(t0)) {
    t0 = nowMs - MIN_SPAN_MS;
    t1 = nowMs;
  }

  t0 = scale === 'auto' ? Math.max(t0, t1 - AUTO_SPAN_MS) : t1 - scale;
  if (t1 - t0 < MIN_SPAN_MS) t1 = t0 + MIN_SPAN_MS;
  return { t0, t1 };
}

/** スライダーが動かせる全域。最も古い起点から現在まで */
export function domainOf(nodes: readonly TimelineNode[], axis: Axis, nowMs: number): Axis {
  let oldest = Number.POSITIVE_INFINITY;
  for (const node of nodes) {
    const started = parse(node.started) || parse(node.last_activity);
    if (Number.isFinite(started) && started < oldest) oldest = started;
  }
  if (!Number.isFinite(oldest)) oldest = nowMs - 3_600_000;
  return { t0: Math.min(oldest, axis.t0), t1: nowMs };
}

/* 目盛りはキリの良い絶対時刻に置く。

   相対に 25% 刻みで置くと、目盛りが時刻として読めない(「11:37」のような端数が並ぶ)。
   梯子から「本数が 8 本以下になる最小の刻み」を選び、日以上の刻みは手元の深夜に揃える。 */
const TICK_STEPS: readonly number[] = [
  60_000,
  5 * 60_000,
  15 * 60_000,
  30 * 60_000,
  3_600_000,
  3 * 3_600_000,
  6 * 3_600_000,
  12 * 3_600_000,
  86_400_000,
  2 * 86_400_000,
  7 * 86_400_000,
];

const MAX_TICKS = 8;

export function niceTicks(t0: number, t1: number): number[] {
  const span = t1 - t0;
  const step = TICK_STEPS.find((candidate) => span / candidate <= MAX_TICKS) ?? TICK_STEPS.at(-1);
  if (step === undefined) return [];
  const midnight = new Date(t0);
  midnight.setHours(0, 0, 0, 0);
  const anchor = midnight.getTime();
  const first = anchor + Math.ceil((t0 - anchor) / step) * step;
  const ticks: number[] = [];
  for (let at = first; at <= t1; at += step) ticks.push(at);
  return ticks;
}

/** 目盛りの札。窓が 1 日を跨ぐときだけ日付を添える */
export function formatTick(atMs: number, spanMs: number): string {
  const date = new Date(atMs);
  const pad = (n: number) => String(n).padStart(2, '0');
  const hm = `${pad(date.getHours())}:${pad(date.getMinutes())}`;
  return spanMs > 86_400_000 ? `${date.getMonth() + 1}/${date.getDate()} ${hm}` : hm;
}

/* スライダーの脇の日付は手で書き換えられる。受ける形は 3 つ:
   「YYYY-MM-DD HH:MM」/「YYYY-MM-DD」(00:00)/「HH:MM」(日付は今の値を引き継ぐ) */
export function parseTimeInput(text: string, baseMs: number): number | null {
  const trimmed = text.trim();

  const full = /^(\d{4})[-/](\d{1,2})[-/](\d{1,2})(?:[ T](\d{1,2}):(\d{2}))?$/.exec(trimmed);
  if (full !== null) {
    const at = new Date(
      Number(full[1]),
      Number(full[2]) - 1,
      Number(full[3]),
      Number(full[4] ?? 0),
      Number(full[5] ?? 0),
    ).getTime();
    return Number.isFinite(at) ? at : null;
  }

  const clock = /^(\d{1,2}):(\d{2})$/.exec(trimmed);
  if (clock !== null) {
    const date = new Date(baseMs);
    date.setHours(Number(clock[1]), Number(clock[2]), 0, 0);
    return date.getTime();
  }

  return null;
}
