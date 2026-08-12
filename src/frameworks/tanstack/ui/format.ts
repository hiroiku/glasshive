/* 数と時刻を、画面の狭い欄に収まる文字列にする。

   どれも見せ方だけの話で、内側の値は丸めない。 */

/** 大きな数を桁の頭だけで読ませる。列の幅が揺れないので、縦に並べたとき目で比べられる */
export const formatTokens = (n: number): string => {
  if (n >= 1e9) return `${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(2)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)}k`;
  return String(Math.round(n));
};

/* 今からどれだけ前かを言う。

   刻みを粗くしていくのは、古いものほど正確さが要らないからである。
   1 分未満で負の値になるのは時計のずれのときだけなので、0 で止める。 */
export function formatSince(atMs: number, nowMs: number): string {
  const delta = nowMs - atMs;
  if (delta < 60_000) return `${Math.max(0, Math.floor(delta / 1000))}s ago`;
  if (delta < 3_600_000) return `${Math.floor(delta / 60_000)}m ago`;
  if (delta < 86_400_000) return `${Math.floor(delta / 3_600_000)}h ago`;
  return `${Math.floor(delta / 86_400_000)}d ago`;
}

/** `transcript` の表記から起こす形。読めない文字列は空にする — 出鱈目な時刻を出すよりよい */
export const formatSinceIso = (iso: string | null, nowMs: number): string => {
  if (iso === null) return '';
  const atMs = Date.parse(iso);
  return Number.isFinite(atMs) ? formatSince(atMs, nowMs) : '';
};

/* 期日までの残り。**`formatSince` を使い回さない** —— あちらは過ぎた時刻を読むためのもので、
   先の時刻を渡すと負の差が 0 に潰れ、来月の期日が「0s ago」として出る。

   日より細かくは刻まない。期日は日で切られたものなので、時間で出すと在りもしない精度が付く。 */
export function formatDue(iso: string | null, nowMs: number): string {
  if (iso === null) return '';
  const atMs = Date.parse(iso);
  if (!Number.isFinite(atMs)) return '';
  const days = Math.round((atMs - nowMs) / 86_400_000);
  if (days === 0) return 'today';
  return days > 0 ? `in ${days}d` : `${-days}d overdue`;
}

const pad = (n: number): string => String(n).padStart(2, '0');

/* ローカルタイムで「年-月-日 時:分」。

   UTC ではなくローカルタイムで出すのは、ユーザーが自分の一日の中で読むからである。
   `transcript` に書かれた表記をそのまま見せる欄(`started`)とは役目が違う。 */
export function absTime(at: string | number | null | undefined): string {
  if (at === null || at === undefined || at === '') return '';
  const date = new Date(at);
  if (Number.isNaN(date.getTime())) return '';
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** 「月/日 時:分:秒」。稼働区間にホバーしたときだけ要る細かさ */
export const mdhms = (atMs: number): string => {
  const date = new Date(atMs);
  return `${date.getMonth() + 1}/${date.getDate()} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
};

/** 「月/日 時:分」 */
export const mdhm = (atMs: number): string => {
  const date = new Date(atMs);
  return `${date.getMonth() + 1}/${date.getDate()} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
};

/** 長さを秒・分・時で。桁を揃えるので、縦に並べたとき目で比べられる */
export function formatDuration(ms: number): string {
  const seconds = Math.max(0, Math.round(ms / 1000));
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m${pad(seconds % 60)}s`;
  return `${Math.floor(minutes / 60)}h${pad(minutes % 60)}m`;
}

/** 分より細かくは言わない長さ。期間の残りのような、そこまで細かくなくてよい場所で使う */
export function formatMinutes(ms: number): string {
  const minutes = Math.max(0, Math.round(ms / 60_000));
  return minutes >= 60 ? `${Math.floor(minutes / 60)}h${pad(minutes % 60)}m` : `${minutes}m`;
}

/** バイトの単位。`transcript` は KiB から始まり、長いものは MiB を超える */
const BYTE_UNITS = ['B', 'KiB', 'MiB', 'GiB'] as const;

/* 読めた量と総量を 1 行にする。**単位を選ぶのは総量のほうである** —— 2 つを別々に丸めると
   `900.0 of 1.2 MiB` のように、大きいほうが小さく見える並びになる。1 つの関数にしてあるのは
   そのためで、分けると片方だけ別の単位で丸める呼び方が書ける。

   B は整数、それより上は小数第 1 位まで。読み終えるまで動き続ける数なので、桁は揃える。 */
export function formatByteRange(done: number, total: number): string {
  let step = 0;
  let left = Math.max(0, total);
  while (left >= 1024 && step < BYTE_UNITS.length - 1) {
    left /= 1024;
    step += 1;
  }
  const scale = (bytes: number) => {
    const value = Math.max(0, bytes) / 1024 ** step;
    return step === 0 ? `${Math.round(value)}` : value.toFixed(1);
  };
  return `${scale(done)} of ${scale(total)} ${BYTE_UNITS[step]}`;
}

/** 長すぎる文字列を切る。切り詰めたことが分かる省略記号を添える */
export const cut = (text: string | null | undefined, max: number): string =>
  text !== null && text !== undefined && text.length > max
    ? `${text.slice(0, max)}…`
    : (text ?? '');

/* 呼ばれ方を、名前の脇へ添えられる短さにする。

   どれも子である以上「agent」「subagent」の末尾は何も言っていない。落とすと役どころだけが残る。
   落とし切って空になる名(`subagent` そのもの)は、落とす前を残す。 */
export const AGENT_TYPE_CHARS = 18;

export const agentTypeShort = (agentType: string | null): string => {
  if (agentType === null) return '';
  const trimmed = agentType.replace(/[-_]?(sub)?agents?$/i, '');
  return cut(trimmed === '' ? agentType : trimmed, AGENT_TYPE_CHARS);
};

/** 一覧では冗長な接頭辞と日付の末尾を落とす。正式な名前はホバーしたときに見せる */
export const modelShort = (model: string | null): string =>
  model === null ? '' : model.replace(/^claude-/, '').replace(/-\d{8}$/, '');

/* 作業ディレクトリ(`cwd`)から worktree の名前を拾う。

   `.worktrees/<名前>` はローカルの決め事で、`transcript` には「ここで動いていた」としか
   書かれていない。決め事を知っているのは見せる側だけなので、ここで拾う。 */
export const worktreeName = (cwd: string | null | undefined): string =>
  /\.worktrees\/([^/]+)/.exec(cwd ?? '')?.[1] ?? '';
