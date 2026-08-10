import type {
  ObservationState,
  ProjectJson,
} from '~/interface/presenters/sessions/tree.presenter.ts';

/* 一覧の行を、ひと目ぶんの観測から起こす。

   ここは数えるだけで、何も読みに行かない。木の中に必要なものが全部入っているので、
   プロジェクトごとに問い直す必要が無い。 */

export interface OverviewRow {
  readonly id: string;
  readonly name: string;
  readonly path: string | null;
  /* 同じ名前のプロジェクトが他にもあるとき、見分けるための一つ上のディレクトリ名。
     いつも出すと画面が文字で埋まるので、名前がぶつかったときだけ持たせる。 */
  readonly parent: string | null;
  /** 自分と子を合わせて動いている数 */
  readonly active: number;
  readonly waiting: number;
  /** 人の入力を待っている数。**glasshive のいちばんの用事** */
  readonly input: number;
  readonly tokens24h: number | null;
  readonly tokens24hState: ObservationState;
  readonly lastActivityMs: number | null;
  readonly liveProcess: boolean;
}

/** 行の頭に置く点の色。人待ちを最優先に見せる */
export type RowDotState = 'input' | 'active' | 'waiting' | 'ended';

export const dotStateOf = (row: OverviewRow): RowDotState => {
  if (row.input > 0) return 'input';
  if (row.active > 0) return 'active';
  return row.liveProcess ? 'waiting' : 'ended';
};

const latestMsOf = (project: ProjectJson): number | null => {
  let latest: number | null = null;
  for (const session of project.sessions) {
    const atMs = Date.parse(session.last_activity);
    if (!Number.isFinite(atMs)) continue;
    if (latest === null || atMs > latest) latest = atMs;
  }
  return latest;
};

/* 同じ名前を持つプロジェクトを数える。

   `~/.claude` の下では、別々の作業ディレクトリが同じ末尾の名前を持つことが珍しくない
   (`main` / `web` / `api` など)。行に名前しか出さないと、どれがどれだか分からない。 */
const duplicatedNames = (projects: readonly ProjectJson[]): ReadonlySet<string> => {
  const seen = new Set<string>();
  const twice = new Set<string>();
  for (const project of projects) {
    if (seen.has(project.name)) twice.add(project.name);
    seen.add(project.name);
  }
  return twice;
};

/** 一つ上のディレクトリ名。パスが分からないプロジェクトには出せるものが無い */
const parentNameOf = (path: string | null): string | null => {
  if (path === null) return null;
  const parts = path.split('/').filter((part) => part !== '');
  return parts.length >= 2 ? (parts[parts.length - 2] ?? null) : null;
};

export function deriveRows(projects: readonly ProjectJson[]): readonly OverviewRow[] {
  const ambiguous = duplicatedNames(projects);

  return projects.map((project) => {
    let active = 0;
    let waiting = 0;
    let input = 0;
    for (const session of project.sessions) {
      if (session.state === 'active') active += 1;
      if (session.state === 'waiting') waiting += 1;
      if (session.awaiting === 'user') input += 1;
      /* 子も動いている数に足す。子はプロジェクトごとの行には現れないので、
         ここで数えないと「何も動いていない」ように見える。 */
      for (const subagent of session.subagents) {
        if (subagent.state === 'active') active += 1;
      }
    }

    return {
      id: project.id,
      name: project.name,
      path: project.path,
      parent: ambiguous.has(project.name) ? parentNameOf(project.path) : null,
      active,
      waiting,
      input,
      tokens24h: project.tokens_24h,
      tokens24hState: project.tokens_24h_state,
      lastActivityMs: latestMsOf(project),
      liveProcess: project.live_process,
    };
  });
}

/* 並べ替えのキー。既定は `standing`。

   **人が待たされているプロジェクトを最初に出す。** 消費の多い順にすると、昨日ぶん回した
   プロジェクトが居座り、今まさに返事を待っているプロジェクトが下へ沈む。glasshive は
   消費を眺めるためのものではない。 */
export type SortKey = 'standing' | 'name' | 'active' | 'waiting' | 'input' | 'tokens' | 'last';
export type SortDirection = 'asc' | 'desc';

export interface SortOrder {
  readonly key: SortKey;
  readonly direction: SortDirection;
}

export const DEFAULT_SORT: SortOrder = { key: 'standing', direction: 'desc' };

/** 観測できなかった消費は、0 とも大きいとも言えない。並びでは最も後ろへ置く */
const tokensRank = (row: OverviewRow): number => row.tokens24h ?? -1;

/* 立ち位置の重み。人待ち > 稼働 > 待機 > それ以外。
   同じ重みの中では最終活動の新しい順になるよう、比較関数が続けて時刻を見る。 */
const standingRank = (row: OverviewRow): number => {
  if (row.input > 0) return 3;
  if (row.active > 0) return 2;
  if (row.waiting > 0 || row.liveProcess) return 1;
  return 0;
};

const rankOf = (row: OverviewRow, key: SortKey): number => {
  switch (key) {
    case 'standing':
      return standingRank(row);
    case 'active':
      return row.active;
    case 'waiting':
      return row.waiting;
    case 'input':
      return row.input;
    case 'tokens':
      return tokensRank(row);
    default:
      return row.lastActivityMs ?? 0;
  }
};

export function sortRows(
  rows: readonly OverviewRow[],
  order: SortOrder = DEFAULT_SORT,
): readonly OverviewRow[] {
  const sign = order.direction === 'asc' ? -1 : 1;
  return [...rows].sort((a, b) => {
    if (order.key === 'name') return sign * b.name.localeCompare(a.name);
    const gap = rankOf(a, order.key) - rankOf(b, order.key);
    if (gap !== 0) return sign * -gap;
    /* 決着が付かないときは新しい順。**最後は id で決める** —
       時刻まで同じプロジェクトが並びを入れ替え続けると、目で追えなくなる。 */
    const byTime = (b.lastActivityMs ?? 0) - (a.lastActivityMs ?? 0);
    return byTime !== 0 ? byTime : a.id.localeCompare(b.id);
  });
}

/* 一覧に出す期間。**既定は 30 日。**

   一覧には `~`(ホームディレクトリ)の下で観測できたプロジェクトが全部並ぶので、絞らないと、
   いま動いているものが古いプロジェクトに埋もれる。7 日にすると「先週触った案件」が消えて
   狭すぎる。 */
export type OverviewSpan = '24h' | '7d' | '30d' | 'all';

export const DEFAULT_SPAN: OverviewSpan = '30d';

const DAY_MS = 86_400_000;

const SPAN_MS: Record<OverviewSpan, number | null> = {
  '24h': DAY_MS,
  '7d': 7 * DAY_MS,
  '30d': 30 * DAY_MS,
  all: null,
};

/* 最終活動が期間の内に在る行だけを残す。

   **時刻を観測できなかった行は落とさない。** 観測できなかったことを「古い」に言い換えると、
   そのプロジェクトが期間の外に居るように見え、ユーザーには最初から無かったのと同じになる。 */
export function withinSpan(
  rows: readonly OverviewRow[],
  span: OverviewSpan,
  nowMs: number,
): readonly OverviewRow[] {
  const width = SPAN_MS[span];
  if (width === null) return rows;
  return rows.filter((row) => row.lastActivityMs === null || nowMs - row.lastActivityMs <= width);
}

/** 名前とパスの両方を見る。パスで絞れないと、同じ名前のプロジェクトを選び分けられない */
export function filterRows(rows: readonly OverviewRow[], query: string): readonly OverviewRow[] {
  const needle = query.trim().toLowerCase();
  if (needle === '') return rows;
  return rows.filter(
    (row) =>
      row.name.toLowerCase().includes(needle) || (row.path ?? '').toLowerCase().includes(needle),
  );
}

/** バーの長さを決める基準。全部 0 のときに 0 で割らないよう 1 で下支えする */
export const tokensCeiling = (rows: readonly OverviewRow[]): number =>
  Math.max(1, ...rows.map((row) => row.tokens24h ?? 0));

export interface OverviewTotals {
  readonly active: number;
  readonly waiting: number;
  readonly input: number;
  readonly tokens: number;
  /** 1 つでも観測できなかったプロジェクトがあったか。合計を「これで全部だ」と出さないためのフラグ */
  readonly tokensPartial: boolean;
}

export function totalsOf(rows: readonly OverviewRow[]): OverviewTotals {
  let active = 0;
  let waiting = 0;
  let input = 0;
  let tokens = 0;
  let tokensPartial = false;
  for (const row of rows) {
    active += row.active;
    waiting += row.waiting;
    input += row.input;
    if (row.tokens24h === null) tokensPartial = tokensPartial || row.tokens24hState !== 'absent';
    else tokens += row.tokens24h;
  }
  return { active, waiting, input, tokens, tokensPartial };
}
