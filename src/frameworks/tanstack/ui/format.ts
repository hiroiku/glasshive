/* 数と時刻を、画面の狭い欄に収まる字にする。

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

/** 正本の字面から起こす形。読めない字は空にする — 出鱈目な時刻を出すよりよい */
export const formatSinceIso = (iso: string | null, nowMs: number): string => {
  if (iso === null) return '';
  const atMs = Date.parse(iso);
  return Number.isFinite(atMs) ? formatSince(atMs, nowMs) : '';
};

const pad = (n: number): string => String(n).padStart(2, '0');

/* 手元の時刻で「年-月-日 時:分」。

   世界時ではなく手元の時刻で出すのは、観る人が自分の一日の中で読むからである。
   正本に書かれた字面をそのまま見せる欄(`started`)とは役目が違う。 */
export function absTime(at: string | number | null | undefined): string {
  if (at === null || at === undefined || at === '') return '';
  const date = new Date(at);
  if (Number.isNaN(date.getTime())) return '';
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** 「月/日 時:分:秒」。帯に載せたときだけ要る細かさ */
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

/** 分より細かくは言わない長さ。窓の残りのような、そこまで細かくなくてよい場所で使う */
export function formatMinutes(ms: number): string {
  const minutes = Math.max(0, Math.round(ms / 60_000));
  return minutes >= 60 ? `${Math.floor(minutes / 60)}h${pad(minutes % 60)}m` : `${minutes}m`;
}

/** 長すぎる字を切る。切ったことが分かる印を添える */
export const cut = (text: string | null | undefined, max: number): string =>
  text !== null && text !== undefined && text.length > max
    ? `${text.slice(0, max)}…`
    : (text ?? '');

/* 呼ばれ方を、名前の脇へ添えられる短さにする。

   どれも子である以上「agent」「subagent」の尾は何も言っていない。落とすと役どころだけが残る。
   落とし切って空になる名(`subagent` そのもの)は、落とす前を残す。 */
export const AGENT_TYPE_CHARS = 18;

export const agentTypeShort = (agentType: string | null): string => {
  if (agentType === null) return '';
  const trimmed = agentType.replace(/[-_]?(sub)?agents?$/i, '');
  return cut(trimmed === '' ? agentType : trimmed, AGENT_TYPE_CHARS);
};

/** 一覧では冗長な接頭辞と日付の尾を落とす。正式な名前は載せたときに見せる */
export const modelShort = (model: string | null): string =>
  model === null ? '' : model.replace(/^claude-/, '').replace(/-\d{8}$/, '');

/* 作業場所から worktree の名前を拾う。

   `.worktrees/<名前>` は手元の決め事で、正本には「ここで動いていた」としか書かれていない。
   決め事を知っているのは見せる側だけなので、ここで拾う。 */
export const worktreeName = (cwd: string | null | undefined): string =>
  /\.worktrees\/([^/]+)/.exec(cwd ?? '')?.[1] ?? '';
