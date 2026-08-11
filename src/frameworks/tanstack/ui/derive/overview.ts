import type {
  ObservationState,
  ProjectJson,
} from '~/interface/presenters/sessions/tree.presenter.ts';
import { sourcesStateOf } from './sources.ts';

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
  /* この行の中身を読み終えているか。**読む前は、数がどれも `null` である。**

     `0` にしない。読んでいないことを「1 つも動いていない」と書くのは、
     観測できなかったことを「無かった」と書くのと同じ取り違えである。 */
  readonly read: boolean;
  readonly active: number | null;
  readonly waiting: number | null;
  /** 人の入力を待っている数。**glasshive のいちばんの用事** */
  readonly input: number | null;
  readonly tokens24h: number | null;
  readonly tokens24hState: ObservationState;
  readonly lastActivityMs: number | null;
  readonly liveProcess: boolean;
  /* このプロジェクトの `transcript` を数え上げられたか。**`read` とは別の問いである。**

     `read` は中身を読み終えたかを言う。こちらは、読む相手を数え上げられたかを言う。
     数え上げられなかったプロジェクトは読み終えた後も `sessions` が短いままなので、
     この欄が無いと、この行の数は「静かなプロジェクト」と同じ形になる。 */
  readonly sourcesState: ObservationState;
  /** プロジェクトの中で何かが動いていた時間の和集合。読む前は空 */
  readonly spans: readonly Span[];
  /** 稼働区間を全部見られたか。読む前は「見ていない」ので偽 */
  readonly spansComplete: boolean;
}

/** 行の頭に置く点の色。人待ちを最優先に見せる */
export type RowDotState = 'input' | 'active' | 'waiting' | 'ended' | 'unknown';

/* 点を決めるのに要る観測だけを取り出した形。

   **一覧の行もタブも、同じ形へ寄せてから同じ関数へ渡す。** 節を写し取ると、1 つの画面が
   同じプロジェクトについて 2 つの答えを出す —— 写した先が先頭の 1 節を落とすだけで、
   一覧が `unknown` と描く行を、タブは `ended` と断定する。 */
export interface DotFacts {
  readonly read: boolean;
  readonly input: number | null;
  readonly active: number | null;
  readonly sourcesState: ObservationState;
  readonly liveProcess: boolean;
}

/* 数を断定できない行は `unknown` に倒す。**`ended` に落としてはいけない。**

   `ended` の点は「このプロジェクトでは何も動いていない」という断定である。読む前の行は
   数を 1 つも持っていないので、その断定はできない。数え上げられなかった行も同じで、
   見えなかった側に動いているセッションが居ないとは言えない。塗らずに輪郭だけを出す。

   人待ちと稼働だけは、数え上げられなかった行でも言ってよい。見えた 1 本が動いている
   ことは、他に何本見落としていても変わらない。 */
export const dotStateOf = (facts: DotFacts): RowDotState => {
  if (!facts.read) return 'unknown';
  if ((facts.input ?? 0) > 0) return 'input';
  if ((facts.active ?? 0) > 0) return 'active';
  if (facts.sourcesState === 'unobservable') return 'unknown';
  return facts.liveProcess ? 'waiting' : 'ended';
};

/** プロジェクト 1 つを、そのまま点の材料へ寄せる。行を起こしていない画面はこれを使う */
export const dotFactsOf = (project: ProjectJson): DotFacts => {
  const counts = liveCounts(project);
  return {
    read: project.read,
    input: counts.input,
    active: counts.active,
    sourcesState: sourcesStateOf(project),
    liveProcess: project.live_process,
  };
};

/** 稼働区間 1 つ。`[始まり, 終わり]` のミリ秒 */
export type Span = readonly [number, number];

/* プロジェクトの中で何かが動いていた時間の**和集合**。

   セッションもサブエージェントも 1 本にまとめる。誰が動いていたかは一覧の欄が数で言うので、
   ここで要るのは「このプロジェクトは、いつ動いていたか」だけである。

   重なりを潰さずに描くと、同時に 3 つ動いていた時間が 3 本の線になって、
   ずっと動き続けていたプロジェクトと見分けが付かなくなる。 */
export function unionSpans(project: ProjectJson): readonly Span[] {
  const raw: Span[] = [];
  const take = (intervals: readonly [string, string][]) => {
    for (const [from, to] of intervals) {
      const fromMs = Date.parse(from);
      const toMs = Date.parse(to);
      if (!Number.isFinite(fromMs) || !Number.isFinite(toMs)) continue;
      raw.push([fromMs, Math.max(toMs, fromMs)]);
    }
  };
  for (const session of project.sessions) {
    take(session.intervals);
    for (const subagent of session.subagents) take(subagent.intervals);
  }

  raw.sort((a, b) => a[0] - b[0]);
  const merged: Span[] = [];
  for (const span of raw) {
    const last = merged[merged.length - 1];
    if (last !== undefined && span[0] <= last[1]) {
      merged[merged.length - 1] = [last[0], Math.max(last[1], span[1])];
      continue;
    }
    merged.push(span);
  }
  return merged;
}

/** いま何が動いているか。人待ちと稼働と待機を、プロジェクト 1 つぶんで数える */
interface LiveCounts {
  readonly active: number;
  readonly waiting: number;
  readonly input: number;
}

/* 動いている数を数える。**子も稼働に足す。** 子はプロジェクトごとの行には現れないので、
   ここで数えないと、子だけが働いているプロジェクトが「何も動いていない」ように見える。 */
function liveCounts(project: ProjectJson): LiveCounts {
  let active = 0;
  let waiting = 0;
  let input = 0;
  for (const session of project.sessions) {
    if (session.state === 'active') active += 1;
    if (session.state === 'waiting') waiting += 1;
    if (session.awaiting === 'user') input += 1;
    for (const subagent of session.subagents) {
      if (subagent.state === 'active') active += 1;
    }
  }
  return { active, waiting, input };
}

/* 稼働区間を全部見られたか。**1 つでも欠けていれば、欠けていると言う** —
   途切れた絵を「静かだった」として出すと、観測できなかったことが無かったことになる。 */
const spansCompleteOf = (project: ProjectJson): boolean =>
  project.sessions.every(
    (session) =>
      session.intervals_complete &&
      session.intervals_state === 'observed' &&
      session.subagents.every(
        (subagent) => subagent.intervals_complete && subagent.intervals_state === 'observed',
      ),
  );

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
    /* 読む前の行は、識別だけを持って数を持たない。ここで 0 を作ると、
       画面はそれを「静かなプロジェクト」として描く。 */
    if (!project.read) {
      return {
        id: project.id,
        name: project.name,
        path: project.path,
        parent: ambiguous.has(project.name) ? parentNameOf(project.path) : null,
        read: false,
        active: null,
        waiting: null,
        input: null,
        tokens24h: null,
        tokens24hState: project.tokens_24h_state,
        lastActivityMs: null,
        liveProcess: project.live_process,
        /* 走査は索引を作った時点で済んでいる。読む前でも、数え上げられなかったことは言える */
        sourcesState: project.sources.state,
        spans: [],
        spansComplete: false,
      };
    }

    const sourcesState = sourcesStateOf(project);
    const { active, waiting, input } = liveCounts(project);

    return {
      id: project.id,
      name: project.name,
      path: project.path,
      parent: ambiguous.has(project.name) ? parentNameOf(project.path) : null,
      read: true,
      active,
      waiting,
      input,
      tokens24h: project.tokens_24h,
      tokens24hState: project.tokens_24h_state,
      lastActivityMs: latestMsOf(project),
      liveProcess: project.live_process,
      sourcesState,
      spans: unionSpans(project),
      /* 歩けなかったディレクトリが在るなら、トラックは全部を見ていない。空のトラックを
         「静かだった」として出すと、見に行けなかった時間が静かだった時間として並ぶ。 */
      spansComplete: sourcesState !== 'unobservable' && spansCompleteOf(project),
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
  if ((row.input ?? 0) > 0) return 3;
  if ((row.active ?? 0) > 0) return 2;
  if ((row.waiting ?? 0) > 0 || row.liveProcess) return 1;
  return 0;
};

const rankOf = (row: OverviewRow, key: SortKey): number => {
  switch (key) {
    case 'standing':
      return standingRank(row);
    /* 読む前の行には数が無い。**0 として並べない** — 並べ替えた一覧の中で、
       読んでいない行が「1 つも動いていない行」と同じ場所に置かれることになる。
       -1 に落として、どの向きでも読めた行の外側へ出す。 */
    case 'active':
      return row.active ?? -1;
    case 'waiting':
      return row.waiting ?? -1;
    case 'input':
      return row.input ?? -1;
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

/* 覚えていた並びのまま出し直す。**順位付けそのものは変えない。**

   既定の並びは人待ち・稼働・最終活動から作られるので、変更通知が届くたびに行が入れ替わる。
   ピン留めは行を狙って押す操作なので、狙った行がその瞬間に動くと押し間違える。

   覚えていない行は末尾へ回す。途中へ差し込むと、やはりカーソルの下で行が動く。
   覚えていた行がもう居なければ、そのまま落ちる —— 並びを覚えているだけで、
   観測を覚えているわけではない。 */
export function holdOrder(
  rows: readonly OverviewRow[],
  remembered: readonly string[],
): readonly OverviewRow[] {
  if (remembered.length === 0) return rows;
  const at = new Map(remembered.map((id, index) => [id, index]));
  return [...rows].sort((a, b) => {
    const left = at.get(a.id) ?? Number.MAX_SAFE_INTEGER;
    const right = at.get(b.id) ?? Number.MAX_SAFE_INTEGER;
    return left !== right ? left - right : a.id.localeCompare(b.id);
  });
}

/* 一覧に出す期間。**既定は 30 日。**

   一覧には `~`(ホームディレクトリ)の下で観測できたプロジェクトが全部並ぶので、絞らないと、
   いま動いているものが古いプロジェクトに埋もれる。7 日にすると「先週触った案件」が消えて
   狭すぎる。 */
export type OverviewSpan = '24h' | '7d' | '30d' | 'all';

export const DEFAULT_SPAN: OverviewSpan = '30d';

const DAY_MS = 86_400_000;

export const SPAN_MS: Record<OverviewSpan, number | null> = {
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

/* バーの長さを決める分母。**いま出ている行の合計である。**

   絞り込みを変えれば分母も変わり、出ている行のバーはいつも合わせて 100% になる。
   いちばん多い 1 本を基準にすると、絞り込んでも他の行の長さが変わらないので、
   「いま見ている中でどれだけを占めるか」が読めない。

   全部 0 のときに 0 で割らないよう 1 で下支えする。 */
export const shownTokens = (rows: readonly OverviewRow[]): number =>
  Math.max(
    1,
    rows.reduce((sum, row) => sum + (row.tokens24h ?? 0), 0),
  );

export interface OverviewTotals {
  readonly active: number;
  readonly waiting: number;
  readonly input: number;
  readonly tokens: number;
  /** 1 つでも観測できなかったプロジェクトがあったか。合計を「これで全部だ」と出さないためのフラグ */
  readonly tokensPartial: boolean;
  /** 数え落とした行が在るか。**在るなら、この合計はまだ最終ではない** */
  readonly partial: boolean;
  /* 数え上げられなかった行が在るか。**`partial` の理由がどちらなのかを言うために持つ。**

     読んでいる途中なら待てば揃う。数え上げられなかったのなら、待っても揃わない。
     同じ文で伝えると、ユーザーはいつまでも揃うのを待つことになる。 */
  readonly unreadable: boolean;
}

export function totalsOf(rows: readonly OverviewRow[]): OverviewTotals {
  let active = 0;
  let waiting = 0;
  let input = 0;
  let tokens = 0;
  let tokensPartial = false;
  /* まだ読み終えていない行が混じっているか。合計そのものは出すが、断定はさせない */
  let partial = false;
  let unreadable = false;
  for (const row of rows) {
    /* 読んでいない行は、どの合計にも足さない。**足さないことを黙らない** —
       まだ全部を数えていない合計を、数え終えた合計と同じ顔で出すと、
       その数はいつまでも小さいまま正しく見える。 */
    if (!row.read) {
      partial = true;
      continue;
    }
    /* 数え上げられなかった行の数は足す。**足りないことは黙らない** — 見えたぶんは本当に
       在るが、見えなかった側に何が居るかは分からない。 */
    if (row.sourcesState === 'unobservable') {
      partial = true;
      unreadable = true;
    }
    active += row.active ?? 0;
    waiting += row.waiting ?? 0;
    input += row.input ?? 0;
    if (row.tokens24h === null) tokensPartial = tokensPartial || row.tokens24hState !== 'absent';
    else tokens += row.tokens24h;
  }
  return {
    active,
    waiting,
    input,
    tokens,
    tokensPartial: tokensPartial || partial,
    partial,
    unreadable,
  };
}
