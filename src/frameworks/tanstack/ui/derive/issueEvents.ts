import type { ApiResponse } from '~/interface/presenters/api-error.presenter.ts';
import type {
  GithubIssueEventLogJson,
  GithubIssueEventsJson,
  IssueSummaryJson,
} from '~/interface/presenters/issues/issues.presenter.ts';
import { atPct, clampPct, type GanttAxis } from './issueGantt.ts';
import { closedAt, isClosedStatus } from './issueStatus.ts';

/* 一覧の右のトラックに置く点。**観測した時刻しか置かない。**

   GitHub が返すのはイベントの時刻だけで、着手も見積もりも返らない。だからこの列に描けるのは
   「いつ何が起きたか」であって、期間ではない。1 件のイベントは 1 つの点になり、近すぎて
   見分けの付かないものだけがまとまる。まとまった点も、置くのは先頭のイベントの実際の時刻で、
   中点でも平均でもない。

   読めなかったことと、何も起きなかったことを同じ絵にしないために、状態は 4 つに分けてある。 */

/* 1 本の軸を切る数。**px ではなく軸の割合で切る。**
   列は `1.1fr` で、幅は React からは分からない。px で切ると `ResizeObserver` が要るうえ、
   同じ repository を別の画面で見た人に別の絵が出る。 */
export const EVENT_SLOTS = 30;

export type EventLog =
  | { readonly kind: 'reading' }
  | { readonly kind: 'absent' }
  | { readonly kind: 'unobservable'; readonly reason: string | null }
  | {
      readonly kind: 'observed';
      readonly complete: boolean;
      /** 読めた課題だけが鍵を持つ。**`events: []` の課題も鍵を持つ** —— この Map に居ることが
          「この課題は読んだ」という観測そのものである */
      readonly byId: ReadonlyMap<string, GithubIssueEventsJson>;
    };

/* 問い合わせの答えを 4 つの状態のどれかにする。**まだ読んでいる最中と、読めなかったことを
   分ける** —— 混ぜると、失敗が永久に読み込み中の顔で残る。 */
export function eventLogOf(
  pending: boolean,
  failed: boolean,
  answer: ApiResponse<GithubIssueEventLogJson> | null,
): EventLog {
  if (pending) return { kind: 'reading' };
  if (failed || answer === null) return { kind: 'unobservable', reason: null };
  if (!answer.ok) return { kind: 'unobservable', reason: answer.body.message };

  const body = answer.body;
  if (body.state === 'absent') return { kind: 'absent' };
  if (body.state === 'unobservable') return { kind: 'unobservable', reason: body.reason };

  const byId = new Map<string, GithubIssueEventsJson>();
  for (const entry of body.issues) byId.set(entry.id, entry);
  return { kind: 'observed', complete: body.complete, byId };
}

export interface EventMark {
  /** **重なりの先頭のイベントの実際の時刻。** 中点でも平均でもない —— 誰も観測していない
      時刻に点を置かないための決まりである */
  readonly at: number;
  readonly pct: number;
  readonly count: number;
  readonly lastAt: number;
  /** 重なったイベントの種類。重複を除き、出た順のまま */
  readonly kinds: readonly string[];
}

export interface EventCut {
  readonly left: number;
  readonly width: number;
  /** 左端が観測した時刻ではないとき。`created_at` を読めなかったか、軸の外まで続いている */
  readonly softFrom: boolean;
  /** 右端 —— 記録が始まる時刻 —— が軸の外に在って、端で止めて描いているとき */
  readonly softTo: boolean;
  readonly fromMs: number | null;
  readonly toMs: number;
}

/* 軸の外に在るイベント。**黙って落とさない** —— 表示範囲の外に置けないことと、
   何も起きなかったことは違う。マイルストーンの期日を端で数えているのと同じ扱いである。 */
export interface OffAxis {
  readonly count: number;
  /** 数えたもののうち、軸にいちばん近いものの時刻 */
  readonly at: number;
  /** 読み切れなかった区間が丸ごとこちら側の外に在る */
  readonly cut: boolean;
}

export type RowTrack =
  | { readonly kind: 'reading' }
  | { readonly kind: 'nolog' }
  | {
      readonly kind: 'unread';
      /* なぜ読めていないか。`log` は記録そのものを観測できなかったとき、`row` は記録に
         この課題が居なかったとき、`cut` は記録が切れていてこの課題のぶんが 1 件も無かった
         とき、`unreadable` は受け取ったイベントの時刻をどれも読めなかったときである。 */
      readonly why: 'log' | 'row' | 'cut' | 'unreadable';
      /** 時刻を読めずに落としたイベントの数 */
      readonly dropped: number;
      /** 記録がこの課題のところで切れていたか。**`why` が別の理由でも落とさない** ——
          時刻を読めなかったことと、記録が切れていたことは、同時に成り立つ */
      readonly truncated: boolean;
    }
  | {
      readonly kind: 'read';
      readonly marks: readonly EventMark[];
      /** 読めたイベントの総数。軸の外へ落ちたものも数える */
      readonly count: number;
      /** 時刻を読めずに落としたイベントの数。**0 件として数えない** */
      readonly dropped: number;
      /** 時刻を読めたイベントのうち、いちばん古いものと新しいもの。**軸で切らない** ——
          軸の外のイベントも観測した時刻なので、切ると幅を変えるたびに両端が動く */
      readonly firstAt: number | null;
      readonly lastAt: number | null;
      readonly cut: EventCut | null;
      readonly before: OffAxis | null;
      readonly after: OffAxis | null;
    };

interface Parsed {
  readonly at: number;
  readonly kind: string;
}

/** いつ閉じたか、そしてその時刻が代用か。**軸を持たない** */
export interface CloseInstant {
  readonly at: number;
  readonly approx: boolean;
}

/* いつ閉じたか。**ここだけが決める。そして軸を受け取らない。**

   同じ 1 つの時刻を、その課題の行はフラグとして立て、堰き止められていた行は待ちの始まりと
   して測る。どちらも軸の上の話に見えるが、いつ閉じたかは記録の側の事実であって、見ている
   幅とは関わりが無い。ここが軸を受け取ると、幅を切り替えただけで観測した時刻が代用に
   変わることになる。**描けるかどうかを判じるのは `closeFlagOf` である。**

   `closed_at` を読めたならそれが答えである。読めずに `updated_at` で代用しているときは、
   記録に読めた `closed` のほうが位置として良いので、そちらへ移して代用をやめる。
   ただし、その `closed` の後に `reopened` が在るなら移さない —— そこは閉じたままでは
   なかったと記録の側が言っているので、いま閉じている状態が指す時刻はまだ観測できていない。 */
function closeInstant(issue: IssueSummaryJson, events: readonly Parsed[]): CloseInstant | null {
  // 閉じていない課題の `closed` は経緯であって、いま閉じている時刻ではない
  if (!isClosedStatus(issue.status)) return null;
  const listed = closedAt(issue);
  if (listed !== null && !listed.approx) return listed;
  const observed = lastCloseOf(events);
  return observed === null ? listed : { at: observed, approx: false };
}

/* 記録がいちばん後に言う `closed`。**その後に `reopened` が在るなら答えない** ——
   開き直された 1 回は、いま閉じている状態が始まった時刻ではない。 */
function lastCloseOf(events: readonly Parsed[]): number | null {
  let closed: number | null = null;
  let reopened: number | null = null;
  for (const event of events) {
    if (event.kind === 'closed' && (closed === null || event.at > closed)) closed = event.at;
    if (event.kind === 'reopened' && (reopened === null || event.at > reopened))
      reopened = event.at;
  }
  if (closed === null) return null;
  return reopened !== null && reopened > closed ? null : closed;
}

/** 課題ごとの閉じた時刻。**軸を渡さない** —— 一覧のどこから読んでも同じ答えになる */
export function buildCloses(
  issues: readonly IssueSummaryJson[],
  log: EventLog,
): ReadonlyMap<string, CloseInstant> {
  const closes = new Map<string, CloseInstant>();
  for (const issue of issues) {
    const id = issue.id ?? '';
    const entry = log.kind === 'observed' ? log.byId.get(id) : undefined;
    const close = closeInstant(issue, entry === undefined ? [] : parseEvents(entry));
    if (close !== null) closes.set(id, close);
  }
  return closes;
}

/** 閉じた時刻のフラグ。軸の中に入るときだけ立つ */
export interface CloseFlag {
  readonly at: number;
  readonly pct: number;
  /** `closed_at` を読めず `updated_at` で代用した時刻か */
  readonly approx: boolean;
}

/* 閉じた時刻を軸の上に置く。**置けるかどうかだけを判じる** —— 代用かどうかは
   `closeInstant` が既に決めているので、ここで判じ直さない。軸の外の時刻に立つフラグは
   無いが、それは「閉じていない」ではなく「ここには描けない」である。 */
export function closeFlagOf(close: CloseInstant | null, axis: GanttAxis): CloseFlag | null {
  if (close === null || close.at < axis.t0 || close.at > axis.t1) return null;
  return { at: close.at, pct: atPct(close.at, axis), approx: close.approx };
}

/** 軸の上に置いた、作られた時刻の輪 */
export interface OpenMark {
  readonly at: number;
  readonly pct: number;
  /** 端に寄せて置いたか。**この位置は観測した時刻ではない** —— 描く側がそう見せる */
  readonly clamped: 'before' | 'after' | null;
}

/* 作られた時刻を軸の上に置く。**軸の外でも置く** —— どの課題にも始まりは在るので、置くのを
   やめると「まだ無かった課題」と同じ絵になる。ここがフラグと違うのはそこだけで、閉じたかどうかは
   その課題が答えないことが在るが、開いたかどうかはどの課題も答える。

   軸の外に在るときは端に寄せ、`clamped` を立てて渡す。寄せた位置は誰も観測していない時刻
   なので、そのまま硬く描けば、そこで開いたことになる。

   数には入らない。軸の外のイベントを数える `‹N` は起きたことだけを数えていて、始まりは
   そこに含まれない。 */
export function openMarkOf(createdMs: number | null, axis: GanttAxis): OpenMark | null {
  if (createdMs === null || !Number.isFinite(createdMs)) return null;
  if (createdMs < axis.t0) return { at: createdMs, pct: 0, clamped: 'before' };
  if (createdMs > axis.t1) return { at: createdMs, pct: 100, clamped: 'after' };
  return { at: createdMs, pct: atPct(createdMs, axis), clamped: null };
}

/** トラックの線が結ぶ両端。**軸を持たない** —— 幅を変えても、この 2 つの時刻は動かない */
export interface TrackEnds {
  readonly fromMs: number;
  readonly toMs: number;
  /** 始まりが `created_at` か。読めなかったときは、いちばん古いイベントが始まりになる */
  readonly opened: boolean;
  /** 終わりが閉じた時刻か。そうでなければ、いちばん新しいイベントである */
  readonly closed: boolean;
  /** 終わりが `updated_at` で代用した時刻か */
  readonly approxTo: boolean;
}

/* トラックの線の両端。**どちらも観測した時刻である。**

   `created_at` も観測した時刻の 1 つなので、線は開いた時刻から始まり、最後に観測した時刻で
   止まる。**いまの時刻までは引かない** —— そこは誰も観測していないので、引けば開いている
   限り伸び続けるバーになる。観測した時刻が 1 つしか無い行は線を持たない。輪 1 つが
   「観測した時刻は 1 つだった」という答えそのものである。 */
export function trackEndsOf(
  createdMs: number | null,
  track: RowTrack,
  close: CloseInstant | null,
): TrackEnds | null {
  if (track.kind !== 'read') return null;
  const opening = createdMs !== null && Number.isFinite(createdMs) ? createdMs : null;
  const first = opening === null ? track.firstAt : Math.min(opening, track.firstAt ?? opening);
  if (first === null) return null;

  const last = Math.max(first, track.lastAt ?? first, close === null ? first : close.at);
  if (last === first) return null;

  // 終わりが閉じた時刻そのものなら、代用かどうかもその 1 つの答えから採る
  const closing = close !== null && close.at === last ? close : null;
  return {
    fromMs: first,
    toMs: last,
    opened: opening !== null && opening === first,
    closed: closing !== null,
    approxTo: closing?.approx ?? false,
  };
}

/** 軸の上に置いた線。両端が軸の外なら、そこに置くところは無い */
export interface TrackLine {
  readonly left: number;
  readonly width: number;
  /** 端が観測した時刻ではないとき。軸の端で止めているか、代用の時刻である */
  readonly softFrom: boolean;
  readonly softTo: boolean;
}

/* 両端を軸の上に置く。**置けるかどうかだけを判じる** —— どの時刻とどの時刻を結ぶのかは
   `trackEndsOf` が既に決めているので、ここで測り直さない。

   端が軸の外に在るなら軸の端で止めて、**その端をぼかす** —— 止めた位置は誰も観測して
   いない時刻なので、硬い端で描けばそこで始まった(終わった)ことになる。代用の時刻の端も
   同じくぼかす。 */
export function trackLineOf(ends: TrackEnds | null, axis: GanttAxis): TrackLine | null {
  if (ends === null) return null;
  const left = clampPct(atPct(ends.fromMs, axis));
  const right = clampPct(atPct(ends.toMs, axis));
  /* 両端が軸の端で同じところへ潰れた。線として引くものは残っていない ——
     丸ごと軸の外に在る行も、片端が軸の端ちょうどの行も、ここで落ちる */
  if (right <= left) return null;
  return {
    left,
    width: right - left,
    softFrom: ends.fromMs < axis.t0,
    softTo: ends.approxTo || ends.toMs > axis.t1,
  };
}

/* 記録の並びにこの課題が居ないときのトラック。**「読んで、居なかった」を「まだ読んでいる」に
   落とさない** —— 落とすと、読み終えた記録の下でその行だけが永久に読み込み中の顔で残る。 */
export function unlistedTrack(log: EventLog): RowTrack {
  if (log.kind === 'reading') return { kind: 'reading' };
  if (log.kind === 'absent') return { kind: 'nolog' };
  return {
    kind: 'unread',
    why: log.kind === 'unobservable' ? 'log' : 'row',
    dropped: 0,
    truncated: false,
  };
}

/** 束ねたトラックと、束ねられなかった課題の数 */
export interface GroupTrack {
  readonly track: RowTrack;
  /** この束の課題のうち、記録の並びに居なかったものの数。**黙って束ねない** ——
      1 件でも読めていなければ、この線は束の全部を語ってはいない */
  readonly unread: number;
  /** いちばん早く作られた課題の `created_at`。**軸を持たない** —— 束の始まりである */
  readonly openedMs: number | null;
}

/* いくつかの課題を 1 本のトラックに束ねる。**新しい観測ではない** —— 束に起きたことは、
   その課題たちに起きたことを合わせたものである。

   まとめるのは合わせた並びの上でやる。課題ごとにまとめてから重ねると、同じ時刻に 2 つの点が
   並んで、近すぎる点を 1 つにする決まりが束の上では効かなくなる。

   束の始まりは、いちばん早く作られた課題の `created_at` である。読み切れなかったかどうかは
   1 件でも切れていれば切れている —— 束の記録は、その課題たちの記録を合わせたものだからである。

   閉じた時刻は渡さない。**束は閉じない** —— 課題が閉じた 1 回は束にとっては起きたことの 1 つ
   なので、点のまま残す。 */
export function groupTrack(
  issues: readonly IssueSummaryJson[],
  log: EventLog,
  axis: GanttAxis,
): GroupTrack {
  if (log.kind !== 'observed') return { track: unlistedTrack(log), unread: 0, openedMs: null };

  const events: GithubIssueEventsJson['events'][number][] = [];
  let truncated = false;
  let unread = 0;
  let openedMs: number | null = null;
  for (const issue of issues) {
    const opened = openedAt(issue);
    if (opened !== null && (openedMs === null || opened < openedMs)) openedMs = opened;

    const entry = log.byId.get(issue.id ?? '');
    if (entry === undefined) {
      unread += 1;
      continue;
    }
    events.push(...entry.events);
    if (entry.truncated) truncated = true;
  }

  /* 1 件も読めていない束。**読んで何も起きていなかった束と同じ絵にしない** —— どちらも
     点の無いトラックになるが、片方は「起きなかった」で、もう片方は「読めていない」である。 */
  if (unread === issues.length) return { track: unlistedTrack(log), unread, openedMs };

  const slot = (axis.t1 - axis.t0) / EVENT_SLOTS;
  return {
    track: readTrack(openedMs, { id: '', events, truncated }, null, axis, slot),
    unread,
    openedMs,
  };
}

/** 読めた `created_at`。読めなければ `null` —— 読めない時刻を軸の左端として使わない */
const openedAt = (issue: IssueSummaryJson): number | null => {
  const at = Date.parse(issue.created_at ?? '');
  return Number.isFinite(at) ? at : null;
};

/** 時刻を読めたイベントだけ。読めなかったものは件数として `readTrack` が数える */
function parseEvents(entry: GithubIssueEventsJson): Parsed[] {
  const parsed: Parsed[] = [];
  for (const event of entry.events) {
    const at = Date.parse(event.at);
    if (Number.isFinite(at)) parsed.push({ at, kind: event.kind });
  }
  return parsed;
}

/* 行ごとのトラックを一度に組む。**行の中で組まない** —— 行の中でやると、どれか 1 行に
   ホバーしただけで 200 行ぶんの点が組み直され、行の `memo` が効かなくなる。

   閉じた時刻は `closes` から受け取る。**ここで測り直さない** —— フラグの立つ 1 回を点から
   落とすのは描き方の話なので、どの時刻がその 1 回なのかは決める側と同じ答えでなければ、
   同じ 1 回がフラグと点の 2 つの形で並ぶ。 */
export function buildTracks(
  issues: readonly IssueSummaryJson[],
  log: EventLog,
  closes: ReadonlyMap<string, CloseInstant>,
  axis: GanttAxis,
): ReadonlyMap<string, RowTrack> {
  const tracks = new Map<string, RowTrack>();
  const slot = (axis.t1 - axis.t0) / EVENT_SLOTS;

  for (const issue of issues) {
    const id = issue.id ?? '';
    const entry = log.kind === 'observed' ? log.byId.get(id) : undefined;
    tracks.set(
      id,
      entry === undefined
        ? unlistedTrack(log)
        : readTrack(openedAt(issue), entry, closes.get(id) ?? null, axis, slot),
    );
  }
  return tracks;
}

function readTrack(
  createdMs: number | null,
  entry: GithubIssueEventsJson,
  close: CloseInstant | null,
  axis: GanttAxis,
  slot: number,
): RowTrack {
  const parsed = parseEvents(entry);
  const count = parsed.length;
  const dropped = entry.events.length - count;

  /* 置けるイベントが 1 つも無いのに、記録が切れていたか時刻を読めなかったのなら、この行に
     ついては何も読めていない。**ハッチを掛ける** —— 何も置かないトラックは「読んで、何も
     起きていなかった」という別の答えであり、そこへ落とすと読めなかったぶんが消える。 */
  if (count === 0 && (dropped > 0 || entry.truncated)) {
    return {
      kind: 'unread',
      why: dropped > 0 ? 'unreadable' : 'cut',
      dropped,
      truncated: entry.truncated,
    };
  }

  let oldestHeldMs = Number.POSITIVE_INFINITY;
  let lastAt = Number.NEGATIVE_INFINITY;
  for (const event of parsed) {
    if (event.at < oldestHeldMs) oldestHeldMs = event.at;
    if (event.at > lastAt) lastAt = event.at;
  }

  /* フラグの立つ `closed` を 1 つだけ落とす。**それより前の `closed` は点のまま残す** ——
     閉じて開き直してまた閉じた課題の、途中の 1 回まで消すと、起きたことが減って見える。

     落とすのは、その時刻にフラグが実際に立つときだけである。**立たないフラグのために点を
     消さない** —— 軸の外の `closed` は端の件数が数えているので、消すとその 1 件がどこにも
     残らない。代用の時刻のフラグでも消さない —— 代用の時刻と観測した `closed` は別の 1 回で
     あり、点として並んだ `closed` と `reopened` のほうが経緯を語る。 */
  const held = [...parsed].sort((a, b) => a.at - b.at);
  const flag = closeFlagOf(close, axis);
  if (flag !== null && !flag.approx) {
    const found = held.findLastIndex(
      (event) => event.kind === 'closed' && Math.abs(event.at - flag.at) < slot,
    );
    if (found >= 0) held.splice(found, 1);
  }

  /* まとめる相手はいつも重なりの先頭である。**直前のイベントと比べない** —— 直前と比べると、
     少しずつ間の空いたイベントの列が 1 つの点のまま軸を渡り切ってしまう。先頭と比べる限り、
     隣り合う点は必ずスロット 1 つぶん以上離れる。 */
  interface Group {
    at: number;
    count: number;
    lastAt: number;
    kinds: Set<string>;
  }
  const groups: Group[] = [];
  let current: Group | null = null;
  for (const event of held) {
    if (event.at < axis.t0 || event.at > axis.t1) continue;
    if (current !== null && event.at - current.at < slot) {
      current.count += 1;
      current.lastAt = event.at;
      current.kinds.add(event.kind);
      continue;
    }
    current = { at: event.at, count: 1, lastAt: event.at, kinds: new Set([event.kind]) };
    groups.push(current);
  }

  /* 記録が始まるのは、手元に在るいちばん古いイベントの時刻である。それが軸の左の外なら、
     読み切れなかった区間は軸の上に置けない。**そのときも黙らない** —— 軸の外のイベントを
     数えているならその件数が言い、数えるものが 1 つも無いときは `cutOf` が左端に幅の無い区間を置く。 */
  const startsOffAxis = count > 0 && oldestHeldMs < axis.t0;
  const before = offAxisOf(held, axis, 'before', entry.truncated && startsOffAxis);
  return {
    kind: 'read',
    marks: groups.map((group) => ({
      at: group.at,
      pct: atPct(group.at, axis),
      count: group.count,
      lastAt: group.lastAt,
      kinds: [...group.kinds],
    })),
    count,
    dropped,
    firstAt: Number.isFinite(oldestHeldMs) ? oldestHeldMs : null,
    lastAt: Number.isFinite(lastAt) ? lastAt : null,
    cut: cutOf(createdMs, entry, axis, count === 0 ? null : oldestHeldMs, before !== null),
    before,
    after: offAxisOf(held, axis, 'after', false),
  };
}

/* 軸の外に落ちたイベントの件数。**落としたことを言わずに済ませない** —— 表示範囲を狭めると
   点は全部消えるので、何も言わなければ「5 件起きた課題」と「何も起きていない課題」が同じ絵に
   なる。軸の外のマイルストーンを端で数えているのと同じ扱いである。 */
function offAxisOf(
  held: readonly Parsed[],
  axis: GanttAxis,
  side: 'before' | 'after',
  cut: boolean,
): OffAxis | null {
  let count = 0;
  let nearest = side === 'before' ? Number.NEGATIVE_INFINITY : Number.POSITIVE_INFINITY;
  for (const event of held) {
    if (side === 'before' ? event.at >= axis.t0 : event.at <= axis.t1) continue;
    count += 1;
    if (side === 'before' ? event.at > nearest : event.at < nearest) nearest = event.at;
  }
  if (count === 0) return null;
  return { count, at: nearest, cut };
}

/* 読み切れなかった区間。`timelineItems(last: 30)` なので、欠けているのは**古いほう**である
   —— 区間は `created_at` から、手元に在るいちばん古いイベントまでになる。

   `created_at` を読めないか、軸の外に在るか、手元のいちばん古いイベントより後を指している
   ときは左端をぼかす。右端も、記録の始まりが軸の外なら端で止めてぼかす。
   **硬い端は観測した時刻、ぼかした端は「分からない」である。**

   幅が 0 になっても返す。**幅の無い区間を落とさない** —— 区間の右端は「ここから先が
   手元に在る」という切れ目そのものなので、幅が無くても言うことは残っている。 */
function cutOf(
  createdMs: number | null,
  entry: GithubIssueEventsJson,
  axis: GanttAxis,
  oldestHeldMs: number | null,
  countedBefore: boolean,
): EventCut | null {
  if (!entry.truncated || oldestHeldMs === null) return null;

  /* 記録の始まりが軸の左の外に在るなら、切れ目は軸の上の位置を持たない。左端で数えている
     イベントが在るなら、その件数が読み残しを言うので任せる。**数えるものが無いときは
     任せない** —— フラグへ移した `closed` のように、数えられるはずのイベントが手元の
     並びから外れていることが在り、そのとき黙ると読み残しがどこにも残らない。 */
  const rightRaw = atPct(oldestHeldMs, axis);
  if (rightRaw < 0 && countedBefore) return null;

  const fromMs = createdMs;
  const leftRaw = atPct(fromMs ?? axis.t0, axis);
  const right = clampPct(rightRaw);
  const left = Math.min(clampPct(leftRaw), right);

  return {
    left,
    width: right - left,
    softFrom: fromMs === null || leftRaw < 0 || leftRaw > rightRaw,
    softTo: rightRaw < 0 || rightRaw > 100,
    fromMs,
    toMs: oldestHeldMs,
  };
}
