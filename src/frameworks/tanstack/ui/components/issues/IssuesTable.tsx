import {
  mdiAlertOutline,
  mdiCommentOutline,
  mdiFlagOutline,
  mdiPlay,
  mdiSourceBranch,
} from '@mdi/js';
import { Fragment, memo, useCallback, useMemo, useRef } from 'react';
import type { Translator } from '~/interface/i18n/translator.ts';
import type { IssueSummaryJson } from '~/interface/presenters/issues/issues.presenter.ts';
import type { ProjectJson } from '~/interface/presenters/sessions/tree.presenter.ts';
import { buildDependencyGraph, startOrder } from '../../derive/dependencyGraph.ts';
import {
  issueTypeColor,
  labelColors,
  leadPullRequest,
  subProgress,
} from '../../derive/githubIssue.ts';
import {
  buildCloses,
  buildTracks,
  type CloseInstant,
  closeFlagOf,
  type EventLog,
  type OpenMark,
  openMarkOf,
  type RowTrack,
  type TrackEnds,
  type TrackLine,
  trackEndsOf,
  trackLineOf,
  unlistedTrack,
} from '../../derive/issueEvents.ts';
import {
  atPct,
  clampPct,
  formatGanttTick,
  type GanttAxis,
  type GanttGuide,
  type GanttWindow,
  ganttAxis,
  ganttGridImage,
  ganttGuides,
  ganttTicks,
} from '../../derive/issueGantt.ts';
import {
  buildEdges,
  buildHierarchy,
  childProgress,
  type HierarchyRow,
  LANE_WIDTH,
  relatedIndex,
  startRanker,
} from '../../derive/issueTree.ts';
import { pullStateLabel, reviewLabel } from '../../derive/labels.ts';
import { milestoneBands } from '../../derive/milestones.ts';
import { DAY_MS } from '../../derive/timeWindow.ts';
import {
  liveCount,
  type MatchedWorker,
  viaLabel,
  type WorkerIndex,
  workersOn,
} from '../../derive/workers.ts';
import { type IssueBranch, issueBranchOf, type WorkJoin } from '../../derive/workJoin.ts';
import { absTime, cut, formatDue, formatSinceIso } from '../../format.ts';
import { useT } from '../../i18n/useT.ts';
import { useNav } from '../../nav/NavContext.tsx';
import type { IssueGroup } from '../../nav/search.ts';
import { popStyleOf, prunePops, touchFingerprint } from '../../phase.ts';
import { pressable } from '../../pressable.ts';
import { AgentChip } from '../chips/Chips.tsx';
import { AvatarStack } from '../primitives/Avatar.tsx';
import { Icon } from '../primitives/Icon.tsx';
import { SubjectText } from '../text/SubjectText.tsx';
import { EdgeGutter } from './EdgeGutter.tsx';
import { countOf, stateClass, TrackMarks } from './EventTrack.tsx';

/* 課題の一覧。依存の弧・親子の階層・着手の順・観測した時刻のタイムライン。

   9 列のグリッドで、行は `subgrid` で親の列に乗る。行を包む要素を増やさないこと —
   `subgrid` は直の子にしか効かない。列の並びは `issues.css` の
   `grid-template-columns` と 1 対 1 なので、片方だけを増やすと全部の行がずれる。

   GitHub が言うことと、観測が言うことを、同じ行に並べてある。GitHub の担当は人の申告で、
   隣のチップはいま実際に動いているエージェントである。**食い違いが見えることに意味がある。** */

/** 一度に並べるエージェントのチップの数。溢れたぶんは件数だけ添える */
const MAX_LISTED_WORKERS = 2;

/** 一度に並べるラベルの数 */
const MAX_LISTED_LABELS = 2;

/** 一度に並べる顔の数。これ以上は重なって誰なのか読めない */
const MAX_LISTED_FACES = 3;

/** 弧を引く余白の下限。見出しの「▶ Start」が収まる幅 */
const MIN_GUTTER = 58;

/** 誰も触っていない行に渡す空。毎回作ると、覚えさせた行が中身の同じ配列で描き直される */
const EMPTY_WORKERS: readonly MatchedWorker[] = [];

/** 端に貼り付いた目盛りはラベルが列から溢れる。Agents の見出しと同じところで落とす */
const TICK_EDGE_PCT = 3;

/** 待った長さ。日より細かくは言わない —— 課題の待ちは日の単位で読むものである */
const lagDays = (ms: number): number => Math.round(ms / DAY_MS);

/** 最後に片付いた堰き止めの相手と、その終わり */
interface RowLag {
  readonly at: number;
  readonly blocker: string;
  /** 相手の閉じた時刻が `updated_at` の代用か。**待ちの長さは、その端から測っている** */
  readonly approx: boolean;
}

/** 1 行に引く待ちの線。位置は軸に収めたもので、収めた端は `soft` が言う */
interface RowWait {
  readonly left: number;
  readonly right: number;
  readonly blocker: string;
  readonly days: number;
  readonly approx: boolean;
  /** 始まり —— 相手が片付いた時刻 —— が軸の外に在って、軸の端で止めているとき */
  readonly softFrom: boolean;
  /** 終わり —— この課題が作られた時刻 —— が軸の外に在って、軸の端で止めているとき */
  readonly softTo: boolean;
}

export type IssueSortKey =
  | 'start'
  | 'id'
  | 'title'
  | 'status'
  | 'type'
  | 'labels'
  | 'assignee'
  | 'updated';

export interface IssueOrder {
  readonly key: IssueSortKey;
  readonly direction: 'asc' | 'desc';
}

/* 並べ替えのキー。**着手順だけは別の物差しである** — 他が課題の欄を読むのに対し、
   これは「次に取れるか」を読む。だから同じ列に混ぜず、見出しの側で切り替える。 */
const keyOf = (issue: IssueSummaryJson, key: IssueSortKey): string => {
  if (key === 'id') return issue.id ?? '';
  if (key === 'title') return issue.title ?? '';
  if (key === 'status') return issue.status;
  if (key === 'type') return issue.issue_type ?? '';
  if (key === 'assignee') return issue.assignee ?? '';
  if (key === 'labels') return (issue.labels ?? []).join(',');
  return issue.updated_at ?? '';
};

interface HeadProps {
  readonly label: string;
  readonly sortKey: IssueSortKey;
  readonly order: IssueOrder;
  readonly onSort: (key: IssueSortKey) => void;
  readonly right?: boolean;
}

function SortHead({ label, sortKey, order, onSort, right }: HeadProps) {
  const on = order.key === sortKey;
  const className = [
    'sortable',
    right === true ? 'right' : '',
    on ? 'sorted' : '',
    on && order.direction === 'desc' ? 'desc' : '',
  ]
    .filter(Boolean)
    .join(' ');
  return (
    <button type="button" className={className} onClick={() => onSort(sortKey)}>
      {label}
    </button>
  );
}

export interface IssuesTableProps {
  /** 一覧に出す課題。閉じたものを含めるかは、取ってくる側が決めている */
  readonly issues: readonly IssueSummaryJson[];
  /** 閉じたものまで含む全件。親課題の進捗はここから数える */
  readonly all: readonly IssueSummaryJson[];
  readonly project: ProjectJson | undefined;
  readonly workers: WorkerIndex;
  /** 課題とブランチの突き合わせ。無ければブランチの欄が出ないだけ */
  readonly join?: WorkJoin | undefined;
  readonly query: string;
  readonly onQuery: (query: string) => void;
  readonly status: string | null;
  readonly order: IssueOrder;
  readonly onSort: (key: IssueSortKey) => void;
  /** 右のタイムラインが一度に見せる幅 */
  readonly ganttWindow: GanttWindow;
  /* 課題に起きたことの記録。**一覧とは別に届く** —— 届く前でも一覧は開くので、
     `reading` のまま描き始める。 */
  readonly eventLog: EventLog;
  /** 一覧の束ね方。無ければ束ねず、親子の入れ子のまま並べる */
  readonly group: IssueGroup | undefined;
  readonly nowMs: number;
  /** このプロジェクトを初めて描くか。初回は変化のハイライトを出さない */
  readonly firstPaint: boolean;
}

export function IssuesTable({
  issues,
  all,
  project,
  workers,
  join,
  query,
  onQuery,
  status,
  order,
  onSort,
  ganttWindow,
  eventLog,
  group,
  nowMs,
  firstPaint,
}: IssuesTableProps) {
  const t = useT();
  const nav = useNav();
  const progress = useMemo(() => childProgress(all), [all]);
  const rankOf = useMemo(() => startRanker(issues), [issues]);

  /* 変化のハイライト。絞り込む前の全件を見る — 絞り込んだ結果だけを見ると、
     絞り込みから外れた行の変化が黙って落ちる。 */
  const seenRef = useRef(false);
  const first = firstPaint || !seenRef.current;
  seenRef.current = true;
  prunePops(nowMs);
  for (const issue of issues) {
    const found = workersOn(workers, issue);
    touchFingerprint(
      `i:${issue.id}`,
      [
        issue.status,
        issue.title ?? '',
        issue.assignee ?? '',
        issue.updated_at ?? '',
        (issue.labels ?? []).join(','),
        found.map((worker) => worker.file + worker.state).join(','),
      ].join('|'),
      first,
      nowMs,
    );
  }

  const needle = query.trim().toLowerCase();
  const shown = useMemo(
    () =>
      [...issues]
        .filter((issue) => status === null || issue.status === status)
        .filter((issue) => {
          if (needle === '') return true;
          const found = workersOn(workers, issue);
          return [
            issue.id,
            issue.title,
            issue.assignee,
            issue.status,
            issue.issue_type,
            ...(issue.labels ?? []),
            ...found.map((worker) => `${worker.label}@${worker.where}`),
          ].some((field) => field?.toLowerCase().includes(needle) === true);
        })
        .sort((a, b) => {
          if (order.key === 'start') {
            return rankOf(a) - rankOf(b) || (b.updated_at ?? '').localeCompare(a.updated_at ?? '');
          }
          const sign = order.direction === 'desc' ? -1 : 1;
          return keyOf(a, order.key).localeCompare(keyOf(b, order.key), 'ja') * sign;
        }),
    [issues, needle, status, order.key, order.direction, rankOf, workers],
  );

  /* 着手順は「次に取る一列の待ち行列」である。階層にまとめると、待ち行列の順番が
     親の下へ散って読めなくなる。

     **束に分ける。** 空ける数だけで 1 列に並べると、いま手を付けられない課題が上位に来て、
     着手順の一覧が着手できないものから始まる。

     マイルストーンで束ねているときは、そちらが束を決める。**並べ替えは束の中で効く** ——
     着手順を選んだままマイルストーンで束ねれば、「このマイルストーンで次に取るのはどれか」が読める。 */
  const banded = useMemo(() => {
    if (group === 'milestone' || order.key !== 'start') return null;
    const live = shown.filter((issue) => issue.status !== 'closed');
    const graph = buildDependencyGraph(live);
    const queue = startOrder(graph);
    const unlocks = new Map(graph.nodes.map((node) => [node.issue.id, node.unlocks]));
    const closed = shown.filter((issue) => issue.status === 'closed');
    const ring =
      graph.caught.length === 0 ? '' : `${graph.caught.join(' → ')} → ${graph.caught[0]}`;
    const bands = [
      {
        title: t('Ready now'),
        note: t('{n} waiting on nothing', { n: queue.startable.length }),
        tone: 'ready',
        issues: queue.startable.map((node) => node.issue),
      },
      {
        title: t('Waiting'),
        note: t('{n} free up as the ones above land', { n: queue.waiting.length }),
        tone: '',
        issues: queue.waiting.map((node) => node.issue),
      },
      {
        title: t('Caught in a cycle'),
        note: ring,
        tone: 'caught',
        issues: queue.caught.map((node) => node.issue),
      },
      {
        title: t('Closed'),
        note: t('{n} done', { n: closed.length }),
        tone: 'done',
        issues: closed,
      },
    ].filter((band) => band.issues.length > 0);
    return { bands, unlocks, complete: graph.complete };
  }, [group, order.key, shown, t]);

  /* マイルストーンの束。見出しに出す件数は、**出ている課題だけで数える** ——
     絞り込んだ一覧の見出しに絞る前の件数を出すと、見出しと行が食い違う。 */
  const grouped = useMemo(() => {
    if (group !== 'milestone') return null;
    return milestoneBands(shown).map((band) => ({
      title: band.title ?? t('No milestone'),
      note:
        band.dueOn === null
          ? t('{open} of {total} open', { open: band.open, total: band.total })
          : `${formatDue(t, band.dueOn, nowMs)} · ${t('{open} of {total} open', {
              open: band.open,
              total: band.total,
            })}`,
      tone: band.title === null ? 'done' : '',
      issues: band.issues,
    }));
  }, [group, shown, nowMs, t]);

  const bands = banded?.bands ?? grouped;

  const rows: HierarchyRow[] = useMemo(
    () =>
      bands === null
        ? buildHierarchy(shown)
        : bands.flatMap((band) =>
            band.issues.map((issue) => ({ issue, depth: 0, guides: [], last: true })),
          ),
    [bands, shown],
  );

  /* 束の見出しを差し込む位置。**行の並びの外に持つ** — 弧は行の添字で描いてあるので、
     見出しを行として数に入れると線が 1 行ぶんずれる。 */
  const bandAt = new Map<number, { title: string; note: string; tone: string }>();
  if (bands !== null) {
    let at = 0;
    for (const band of bands) {
      bandAt.set(at, band);
      at += band.issues.length;
    }
  }

  const { edges, lanes } = useMemo(() => buildEdges(rows.map((row) => row.issue)), [rows]);
  const gutter = Math.max(MIN_GUTTER, 18 + lanes * LANE_WIDTH);

  /* 行 1 つぶんの突き合わせを、行の外で 1 度だけ組む。**行の中でやると、どれか 1 行に
     ホバーしただけで 200 行ぶんの突き合わせがやり直される。** */
  const derived = useMemo(() => {
    const index = new Map<
      string,
      { found: readonly MatchedWorker[]; branch: IssueBranch | null }
    >();
    for (const row of rows) {
      index.set(row.issue.id ?? '', {
        found: workersOn(workers, row.issue),
        branch: join === undefined ? null : issueBranchOf(row.issue, join),
      });
    }
    return index;
  }, [rows, workers, join]);

  /* 右のタイムライン。**軸は出ている行だけで決める** —— 絞り込みで消えた課題まで数えると、
     画面に無い課題のために軸が伸びて、残った行のバーが狭いところへ潰れる。 */
  const axis = useMemo(() => ganttAxis(shown, ganttWindow, nowMs), [shown, ganttWindow, nowMs]);
  const guides = useMemo(() => ganttGuides(shown, axis), [shown, axis]);
  const ticks = useMemo(() => ganttTicks(axis.t0, axis.t1), [axis]);
  const axisSpan = axis.t1 - axis.t0;
  const gridImage = useMemo(() => ganttGridImage(guides, axis, nowMs), [guides, axis, nowMs]);
  const inAxis = useMemo(() => datedGuides(guides, 'in'), [guides]);
  const before = datedGuides(guides, 'before');
  const after = datedGuides(guides, 'after');
  const undated = guides.filter((guide) => guide.where === 'undated');

  /* 点と閉じた時刻を組む相手。**絞り込む前の全件と、一覧に渡された課題の両方**である。
     待ちの線は堰き止めていた相手が閉じた時刻を引くので全件が要り、行は自分の `id` で引くので
     渡された課題も要る —— 片方だけで組むと、もう片方にしか居ない行が答えを持たないまま残る。 */
  const covered = useMemo(() => {
    const found = new Map<string, IssueSummaryJson>();
    for (const issue of all) found.set(issue.id ?? '', issue);
    for (const issue of issues) found.set(issue.id ?? '', issue);
    return [...found.values()];
  }, [all, issues]);

  /* 課題ごとの閉じた時刻。**軸を渡さない** —— 依存の並びに `axis` が無いことが、幅を
     切り替えても絞り込んでも同じ答えが出ることそのものである。フラグも待ちの線もここを読む。 */
  const closes = useMemo(() => buildCloses(covered, eventLog), [covered, eventLog]);

  /* 行ごとの点を、行の外で 1 度だけ組む。**行の中で組むと、どれか 1 行にホバーしただけで
     200 行ぶんの点が組み直され、行の `memo` が効かなくなる。**

     行はどれも自分の `id` で引くだけなので、出ていない課題まで組んでも絵は変わらない。 */
  const tracks = useMemo(
    () => buildTracks(covered, eventLog, closes, axis),
    [covered, eventLog, closes, axis],
  );

  /** どちらにも居ない行のトラック。読み終えた記録の下で、その行だけを読み込み中の顔にしない */
  const unlisted = useMemo(() => unlistedTrack(eventLog), [eventLog]);

  /* 待ちの線を、行の外で 1 度だけ組む。待ちを引くには堰き止めている相手が閉じた時刻が要り、
     それは他の行のものなので、行の中では組めない。

     読むのは `closes` である。**フラグから読まない** —— フラグは軸に入るときだけ立つ
     描き方の答えなので、そこから時刻を採ると、幅を切り替えただけで待った長さが変わる。

     **開いたままの相手が 1 つでも在れば、待ちは引かない。** 閉じた時刻の無い相手はまだ
     終わっていないので、そこから「空いた」と言える時刻は観測できていない。

     相手の閉じた時刻が `updated_at` の代用なら、それを持って回る。**代用の端から測った
     長さを、測った長さの顔で描かない** —— 同じ時刻を相手の行はぼかしたフラグで描いており、
     こちらだけが硬い日数を言うと、1 つの時刻が 2 つの意味を持つ。 */
  const lags = useMemo(() => {
    const index = new Map<string, RowLag>();
    for (const row of rows) {
      const from = Date.parse(row.issue.created_at ?? '');
      if (!Number.isFinite(from)) continue;
      /* 待ちを決めるのは、いちばん後に終わる相手である。**先に片付いた相手を採ると、
         まだ他の相手が塞いでいた期間まで「空いていた」と描くことになる。** */
      let latest: RowLag | null = null;
      let open = false;
      for (const dependency of row.issue.deps) {
        if (dependency.type !== 'blocks') continue;
        const on = dependency.on;
        if (on === null || on === row.issue.id) continue;
        /* 手元に無い相手は、まだ閉じていない相手と同じ扱いにする。**無かったことにしない**
           —— 依存が在ることは分かっていて、それがいつ解けたのかを観測できていない。 */
        const end = closes.get(on) ?? null;
        if (end === null) {
          open = true;
          break;
        }
        /* 同じ時刻で終わる相手が 2 つ在るなら、観測した時刻を持つほうを採る。`updated_at` は
           実際に閉じた時刻より後ろにしか出ないので、同じ時刻に読めた `closed` が在るなら、
           塞ぎが解けた時刻はそちらで観測できている。 */
        const better =
          latest === null ||
          end.at > latest.at ||
          (end.at === latest.at && latest.approx && !end.approx);
        if (better) latest = { at: end.at, blocker: on, approx: end.approx };
      }
      // 相手がこの課題の始まりより後に終わるなら、待った時間は無い。逆向きの線は引かない
      if (!open && latest !== null && latest.at < from) index.set(row.issue.id, latest);
    }
    return index;
  }, [rows, closes]);

  /* 触れている行と、繋がっている行。**繋がりの向きは問わない** —
     残したいのは「この課題と関わりのある行」であって、依存の向きではない。

     **React の状態にしない。** ホバーで変わるのは「どれを沈めるか」だけで、行の中身は
     1 つも変わらない。状態に載せると、行に触れるたびに 200 行が丸ごと描き直される
     —— 実測で 1 回 70ms を超えた。ここは `hoverTok` と同じで、class を付け替えるだけでよい。 */
  const related = useMemo(() => relatedIndex(shown), [shown]);
  const listRef = useRef<HTMLDivElement>(null);

  /* `related` が変わるのは `shown` が変わったときで、そのときは行も丸ごと組み直される。
     だから `useCallback` の依存はこれ 1 つでよく、行の memo はホバーの間ずっと効いたままになる。 */
  const light = useCallback(
    (id: string | null, index: number): void => {
      const list = listRef.current;
      if (list === null) return;
      list.classList.toggle('hot', id !== null);
      const kin = id === null ? null : related.get(id);
      for (const row of list.querySelectorAll<HTMLElement>('.issue-row:not(.head)')) {
        const other = row.dataset.id ?? '';
        row.classList.toggle('lit', id !== null && (other === id || kin?.has(other) === true));
      }
      /* 弧は端が触れている行に繋がっているものだけを残す。**向きは問わないが、端が触れて
         いることは問う** —— 関わりのある行どうしを結ぶ弧まで残すと、関係のない線が光る。 */
      for (const shape of list.querySelectorAll<SVGElement>('[data-edge]')) {
        const [a, b] = (shape.getAttribute('data-edge') ?? '').split('-').map(Number);
        const on = id !== null && (a === index || b === index);
        shape.classList.toggle('lit', on);
        shape.classList.toggle('dim', id !== null && !on);
      }
    },
    [related],
  );

  /* 記録の読めなさは、行ごとに繰り返さず 1 度だけ言う。**黙らない** —— 点の無い行が
     「何も起きなかった行」として読まれるのは、この列がいちばんやってはいけない嘘である。

     **理由を 1 つに決めない。** ハッチの絵はどの理由でも同じなので、掛かっている行の
     理由がひとつでも文から漏れると、その行は自分に当てはまらない説明の下に並ぶ。 */
  const unread = useMemo(() => {
    const found = { row: false, cut: false, unreadable: false };
    // 数えるのは出ている行だけである。画面に無い行の理由まで言うと、文がどの行の話か合わない
    for (const row of rows) {
      const track = tracks.get(row.issue.id ?? '') ?? unlisted;
      if (track.kind !== 'unread') continue;
      if (track.why === 'row') found.row = true;
      if (track.why === 'cut') found.cut = true;
      if (track.why === 'unreadable') found.unreadable = true;
    }
    return found;
  }, [rows, tracks, unlisted]);
  const logBand = bandForLog(t, eventLog, unread);

  return (
    <div id="issues-list" ref={listRef} style={{ ['--gt-grid' as string]: gridImage }}>
      <div className="issue-row head">
        {/* 弧の列の見出しは着手順の並べ替えを兼ねる。依存が解けた open を上へ */}
        <button
          type="button"
          className={`sortable dep-sort${order.key === 'start' ? ' sorted' : ''}`}
          style={{ width: gutter }}
          title={t(
            'Sort by start order: open with all blocks cleared, most recently updated first (exclusive with column sort)',
          )}
          onClick={() => onSort('start')}
        >
          <Icon path={mdiPlay} size={11} /> {t('Start')}
        </button>
        <SortHead label={t('ID')} sortKey="id" order={order} onSort={onSort} />
        <SortHead label={t('Title')} sortKey="title" order={order} onSort={onSort} />
        <SortHead label={t('Status')} sortKey="status" order={order} onSort={onSort} />
        <SortHead label={t('Type')} sortKey="type" order={order} onSort={onSort} />
        <SortHead label={t('Labels')} sortKey="labels" order={order} onSort={onSort} />
        <SortHead label={t('Assignee / Agents')} sortKey="assignee" order={order} onSort={onSort} />
        <SortHead label={t('Updated')} sortKey="updated" order={order} onSort={onSort} right />
        {/* 目盛りとマイルストーンの名前を持つ見出し。この列に並べ替えは無いので、押せる形にしない。
            見出しは `position: sticky` なので、名前は一覧を下まで辿る間ずっと残る ——
            だから行の中の線は名前を持たなくてよい */}
        <span className="gt-head">
          {ticks.map((tick) => {
            const x = atPct(tick, axis);
            // 端に貼り付く目盛りは、ラベルが列から溢れる
            if (x < TICK_EDGE_PCT || x > 100 - TICK_EDGE_PCT) return null;
            return (
              <span key={tick} className="tick" style={{ left: `${x}%` }}>
                {formatGanttTick(tick, axisSpan)}
              </span>
            );
          })}
          {/* 名前は自分の線と左隣の線の間に右揃えで置く。**左隣の線より先へは伸びない** ——
              だから期日が近い 2 つでも、名前どうしが重なることが構造として起こらない */}
          {inAxis.map((guide, index) => {
            const pct = atPct(guide.at, axis);
            const earlier = index === 0 ? null : inAxis[index - 1];
            const prev = earlier === undefined || earlier === null ? 0 : atPct(earlier.at, axis);
            // 左端に件数が立つときは、そのぶんだけ最初の名前の場所を空ける
            const room = pct - prev - (index === 0 && undated.length > 0 ? 6 : 0);
            return (
              <b
                key={guide.title}
                className="gt-ms"
                style={{ right: `${100 - pct}%`, maxWidth: `calc(${room}% - 6px)` }}
                title={t('Milestone {title} — due {at}', {
                  title: guide.title,
                  at: absTime(guide.at),
                })}
              >
                {guide.title}
              </b>
            );
          })}
          {/* 軸の外に落ちた期日。**黙って落とさない** —— 線を引けないことと、期日が無いことは違う */}
          {before.length > 0 && (
            <b className="gt-off left" title={offTitle(t, before, 'before')}>
              ‹{before.length}
            </b>
          )}
          {after.length > 0 && (
            <b className="gt-off right" title={offTitle(t, after, 'beyond')}>
              {after.length}›
            </b>
          )}
          {/* 期日の無いマイルストーン。線は引けないが、在ることは言える */}
          {undated.length > 0 && (
            <b className="gt-off left undated" title={undatedTitle(t, undated)}>
              ?{undated.length}
            </b>
          )}
          {/* 読んでいる最中に動くものは、画面に 1 つでよい。行ごとに置くと 200 個が同時に走る */}
          {eventLog.kind === 'reading' && (
            <i className="gt-reading" title={t('Reading the issue event log')} />
          )}
        </span>
      </div>
      {logBand !== null && (
        <Band title={logBand.title} note={logBand.note} tone="cut" key="event-log" />
      )}
      {rows.length === 0 ? (
        <div className="empty">{t('No matching issues')}</div>
      ) : (
        rows.map((row, index) => {
          const band = bandAt.get(index);
          const id = row.issue.id ?? '';
          return (
            /* Fragment は DOM を作らないので、`subgrid` は親の直の子のまま保たれる */
            <Fragment key={id === '' ? index : id}>
              {band !== undefined && <Band title={band.title} note={band.note} tone={band.tone} />}
              <IssueRow
                row={row}
                index={index}
                edges={edges}
                gutter={gutter}
                project={project}
                found={derived.get(id)?.found ?? EMPTY_WORKERS}
                branch={derived.get(id)?.branch ?? null}
                unlocks={banded?.unlocks.get(row.issue.id) ?? null}
                progress={progress}
                axis={axis}
                track={tracks.get(id) ?? unlisted}
                close={closes.get(id) ?? null}
                lag={lags.get(id) ?? null}
                showMilestone={group !== 'milestone'}
                nowMs={nowMs}
                onHot={light}
                onLabel={onQuery}
                onOpen={nav.openIssue}
              />
            </Fragment>
          );
        })
      )}
      {/* 辺を採り切れていないなら黙らない。黙ると、足りない絵が正しい絵として出る */}
      {banded !== null && !banded.complete && (
        <Band
          title={t('Some blocking issues were not fetched')}
          note={t('this order may be missing constraints')}
          tone="cut"
        />
      )}
    </div>
  );
}

/* 束の見出し。**9 列目に空のトラックを持つ** —— 見出しも `subgrid` の行なので、ここに
   トラックが在って初めて、マイルストーンの縦線が見出しを跨いで 1 本に繋がる。 */
function Band({
  title,
  note,
  tone,
}: {
  readonly title: string;
  readonly note: string;
  readonly tone: string;
}) {
  return (
    <div className={`iband${tone === '' ? '' : ` ${tone}`}`}>
      <span className="iband-t">
        <span>{title}</span>
        <em>{note}</em>
      </span>
      <i className="gt" aria-hidden="true" />
    </div>
  );
}

/** 行が読めていない理由の内訳。同じハッチが掛かる理由は 1 つとは限らない */
interface UnreadWhy {
  readonly row: boolean;
  readonly cut: boolean;
  readonly unreadable: boolean;
}

/* 記録そのものについて、一覧の上で 1 度だけ言うこと。

   **「読めなかった」と「無かった」を同じ文にしない。** 前者は観測できなかったことで、
   後者はこのプロジェクトに GitHub のリポジトリが無いということである。

   ハッチの掛かった行が在るのに 1 文も出ないことがあってはならない。**理由はすべて並べる**
   —— 絵はどれも同じなので、文に出ていない理由の行は、他の理由の説明の下に並ぶことになる。 */
function bandForLog(
  t: Translator,
  log: EventLog,
  unread: UnreadWhy,
): { readonly title: string; readonly note: string } | null {
  if (log.kind === 'unobservable') {
    return {
      title: t('Issue events could not be read'),
      note: log.reason ?? t('no reason was given'),
    };
  }
  if (log.kind === 'absent') {
    return { title: t('This project has no issue event log'), note: t('nothing to read') };
  }
  if (log.kind !== 'observed') return null;

  const notes: string[] = [];
  /* 取り直しが読めなかったなら、いま出ているのは前に読めた記録である。**行を消して
     「読めなかった」の絵にしない** —— 消せば、読めていた観測が無かったことになる。
     ここで言うのは、絵が取り直す前のものだということである。 */
  if (log.stale) notes.push(t('these are the events read before the last attempt'));
  // 記録そのものが途中で切れているなら、並びに居ない行はそれで説明が付く
  if (!log.complete) notes.push(t('the event log was cut short'));
  else if (unread.row) notes.push(t('they were not in the event log'));
  if (unread.cut) notes.push(t('for some, it stopped before any of their events'));
  if (unread.unreadable) notes.push(t('for some, no event time could be read'));
  if (notes.length === 0) return null;
  return {
    title: log.stale
      ? t('The issue events could not be refreshed')
      : t('Some issues were not read'),
    note: notes.join(' · '),
  };
}

/* トラック全体の説明。点にホバーしたときは、点の側の説明が勝つ。

   **「読めなかった」を「何も起きなかった」と言わない。** 読めていない行は、なぜ読めていない
   のかをそれぞれの言葉で言う。開いた時刻を読めていないなら、そこを始まりとして語らない。 */
function trackTitle(t: Translator, track: RowTrack, openedAt: boolean): string {
  if (track.kind === 'reading') return t('Reading the issue event log');
  if (track.kind === 'nolog') return t('This project has no issue event log');
  if (track.kind === 'unread') {
    if (track.why === 'log') return t('Issue events could not be read');
    if (track.why === 'row') return t('This issue was not in the event log that was read');
    if (track.why === 'unreadable') {
      // 読めなかったのと切れていたのは同時に起こる。片方だけ言うと、残りが黙って落ちる
      const also = track.truncated ? t(' — the event log was also cut short here') : '';
      return t('The time on {what} could not be read, so nothing is drawn here{also}', {
        what: countOf(t, track.dropped, 'event'),
        also,
      });
    }
    return t('The event log was cut short before it reached any event on this issue');
  }
  const missed =
    track.dropped === 0
      ? ''
      : t(' — the time on {what} could not be read', {
          what: countOf(t, track.dropped, 'other event'),
        });
  if (track.count === 0 || track.lastAt === null) {
    return openedAt
      ? t('No events on record since it was opened{missed}', { missed })
      : t('No events on record for this issue{missed}', { missed });
  }
  return t('{what} read, the last on {at}{missed}', {
    what: countOf(t, track.count, 'event'),
    at: absTime(track.lastAt),
    missed,
  });
}

/* 輪の置き方。軸の端に立つ輪は列の中へ収める。**端に寄せた輪も同じところに立つ** ——
   軸の外の時刻は端で止めてあるので、位置は端の輪と変わらない。変わるのはぼかし方だけである。 */
function openClass(open: OpenMark): string {
  const edge = open.pct <= 0 ? ' at-start' : open.pct >= 100 ? ' at-end' : '';
  const soft =
    open.clamped === 'before' ? ' soft-from' : open.clamped === 'after' ? ' soft-to' : '';
  return `gt-open${edge}${soft}`;
}

/* 輪の説明。**時刻はいつも本当の時刻を言う** —— 端に寄せて描いていても、開いたのはその端では
   ない。幅を広げれば置けるのは軸の手前に在るときだけで、軸の先は `1w` でも `All` でも
   現在より先までは伸びない。だから広げてみるように言うのは手前の側だけにする。 */
function openTitle(t: Translator, open: OpenMark): string {
  const opened = t('Opened {at}', { at: absTime(open.at) });
  if (open.clamped === null) return opened;
  return open.clamped === 'before'
    ? t(
        '{opened}, before this span starts — the ring sits at the edge, not at that time. Widen the span to place it.',
        { opened },
      )
    : t('{opened}, after this span ends — the ring sits at the edge, not at that time.', {
        opened,
      });
}

/* 待ちの線の説明。**測った長さは軸の外まで含んだ長さである** —— 線は軸に収めて引くので、
   端を軸で止めているならそのことも言う。言わないと、8 日ぶんの長さの線が 18 日を名乗る。 */
function lagTitle(t: Translator, wait: RowWait): string {
  const measured = wait.approx
    ? t(
        'Waiting on {blocker} — about {days}d, measured from a close time taken from updated_at, so where this wait starts is approximate',
        { blocker: wait.blocker, days: wait.days },
      )
    : t('Waiting on {blocker} — {days}d from {blocker} ending to this issue being created', {
        blocker: wait.blocker,
        days: wait.days,
      });
  const stopped = [
    wait.softFrom ? t('{blocker} ended before this span', { blocker: wait.blocker }) : '',
    wait.softTo ? t('this issue was created after this span') : '',
  ].filter((clause) => clause !== '');
  if (stopped.length === 0) return measured;
  return t(
    '{measured}. The line stops at the edge of this span: {stopped} — widen the span to see the whole wait.',
    { measured, stopped: stopped.join(t(' and ')) },
  );
}

/* 線の説明。**線が結ぶ 2 つの時刻を言う。長さは言わない** —— 端を軸で止めているときは
   描いた長さが本当の間隔ではないうえ、そもそもこの 2 つの時刻の間を観測したわけではない。

   線が作られた時刻から始まらないのは 2 つの場合である。開いた時刻を読めなかったときと、それより
   古いイベントが記録に在ったときである。**同じ言葉で言わない** —— 後者で「読めなかった」と
   言えば、読めている時刻を読めなかったことにする。どちらでも「開いた」とは語らない ——
   語れば、線の左端が観測した開始時刻に化ける。 */
function lineTitle(t: Translator, ends: TrackEnds, line: TrackLine, openedAt: boolean): string {
  const from = ends.opened
    ? t('Opened {at}', { at: absTime(ends.fromMs) })
    : openedAt
      ? t('First event {at} — earlier than the time this issue was opened', {
          at: absTime(ends.fromMs),
        })
      : t('First event {at} — when this issue was opened could not be read', {
          at: absTime(ends.fromMs),
        });
  const to = !ends.closed
    ? t('last event {at}', { at: absTime(ends.toMs) })
    : ends.approxTo
      ? t('closed around {at}, taken from updated_at', { at: absTime(ends.toMs) })
      : t('closed {at}', { at: absTime(ends.toMs) });
  const stopped = [
    line.softFrom ? t('it starts before this span') : '',
    line.softTo && !ends.approxTo ? t('it runs past this span') : '',
  ].filter((clause) => clause !== '');
  if (stopped.length === 0) return `${from} — ${to}`;
  return t(
    '{from} — {to}. The line stops at the edge of this span: {stopped} — widen the span to see all of it.',
    { from, to, stopped: stopped.join(t(' and ')) },
  );
}

/** 期日を読めたマイルストーンだけを、置ける形にして取り出す */
function datedGuides(
  guides: readonly GanttGuide[],
  where: GanttGuide['where'],
): readonly { readonly title: string; readonly at: number }[] {
  return guides.flatMap((guide) =>
    guide.where === where && guide.at !== null ? [{ title: guide.title, at: guide.at }] : [],
  );
}

/** 軸の外に落ちた期日を数えて名前を添える。件数だけでは、何を見損ねたのか分からない */
function offTitle(
  t: Translator,
  guides: readonly { readonly title: string; readonly at: number }[],
  side: 'before' | 'beyond',
): string {
  const listed = guides.map((guide) => `${guide.title} (${absTime(guide.at)})`).join(', ');
  return side === 'before'
    ? t(
        '{n, plural, one {# milestone is} other {# milestones are}} due before this span: {listed} — widen the span to see them',
        { n: guides.length, listed },
      )
    : t(
        '{n, plural, one {# milestone is} other {# milestones are}} due beyond this span: {listed} — widen the span to see them',
        { n: guides.length, listed },
      );
}

/* 期日そのものが無いマイルストーン。**黙って消さない** —— 消すと「期日が無い」と「そんな
   マイルストーンは無い」が同じ絵になる。軸に置けないので、名前を数えて言うだけにする。 */
function undatedTitle(t: Translator, guides: readonly GanttGuide[]): string {
  const listed = guides.map((guide) => guide.title).join(', ');
  return t(
    '{n, plural, one {# milestone has} other {# milestones have}} no due date: {listed} — nothing can be placed on this axis for them',
    { n: guides.length, listed },
  );
}

interface IssueRowProps {
  readonly row: HierarchyRow;
  readonly index: number;
  readonly edges: ReturnType<typeof buildEdges>['edges'];
  readonly gutter: number;
  readonly project: ProjectJson | undefined;
  /* 触っているエージェントと、PR のブランチ。**行の外で組んで渡す** —— 行の中で組むと、
     どれか 1 行にホバーしただけで 200 行ぶんの突き合わせがやり直される。 */
  readonly found: readonly MatchedWorker[];
  readonly branch: IssueBranch | null;
  /** これを終わらせると着手できるようになる数。着手順で並べているときだけ */
  readonly unlocks: number | null;
  readonly progress: ReadonlyMap<string, { total: number; closed: number }>;
  /* タイムラインの軸。**全行で同じものを見る** —— 行ごとに軸を取ると、同じ位置の点が
     行によって別の時刻を指す。 */
  readonly axis: GanttAxis;
  /** この行のトラック。組むのは表の側で、行は描くだけである */
  readonly track: RowTrack;
  /* この課題が閉じた時刻。**軸に置けるかどうかは行が判じる** —— 時刻そのものを決めるのは
     表の側で、堰き止められていた行の待ちも同じ 1 つの答えを読む。 */
  readonly close: CloseInstant | null;
  /** 直前の堰き止めが片付いた時刻と、その相手。待ちが無ければ `null` */
  readonly lag: RowLag | null;
  /* マイルストーンの名前を、行にも出すか。**束ねているときは出さない** ——
     束の見出しが既に言っているので、行ごとに繰り返すと同じことが 2 度並ぶ。 */
  readonly showMilestone: boolean;
  readonly nowMs: number;
  /** 触れた・離れたを伝える。沈めるのは DOM の側なので、行はここから何も受け取らない */
  readonly onHot: (id: string | null, index: number) => void;
  readonly onLabel: (label: string) => void;
  readonly onOpen: (id: string) => void;
}

/* PR が乗っているブランチの、手元での状態。**課題の欄に git を持ち込む唯一の場所** ——
   繋いでいるのは PR で、推測ではない。

   名前を出して、押せるようにしてある。遅れの数だけでは、どのブランチの話なのかが分からない
   —— 課題からブランチへ渡れて初めて、2 つの単位が繋がる。

   手元の git を観測できていないときも、名前だけは出す。名前は GitHub の PR から読めていて、
   読めていないのは遅れと衝突のほうである。ここを空欄にすると、衝突しているブランチが
   衝突していないものとして読まれる。 */
function Branch({ branch }: { branch: IssueBranch }) {
  const t = useT();
  const nav = useNav();
  const open = (name: string) => nav.openRef(name, name);

  if (branch.kind === 'unread') {
    return (
      <button
        type="button"
        className="brstate unread"
        title={`${branch.name} — ${
          branch.reach === 'pending'
            ? t('still reading the local git')
            : t(
                'the local git could not be read, so how far ahead or behind it is, and whether it conflicts, are unknown',
              )
        }`}
        aria-label={t('Open branch {name}', { name: branch.name })}
        {...pressable(() => open(branch.name), { stopPropagation: true })}
      >
        <Icon path={mdiSourceBranch} size={10} />
        <span className="brname">{cut(branch.name, 22)}</span>
        <b>{branch.reach === 'pending' ? '—' : '?'}</b>
      </button>
    );
  }

  const { name, ahead, behind, worktree, conflictsWith } = branch.branch;
  return (
    <button
      type="button"
      className={`brstate${conflictsWith.length > 0 ? ' warn' : ''}`}
      title={`${t('{name} — {ahead} ahead, {behind} behind', { name, ahead, behind })}${
        worktree === null ? '' : ` · ${t('worktree {name}', { name: worktree })}`
      }${
        conflictsWith.length === 0
          ? ''
          : ` · ${t('touches the same files as {list}', { list: conflictsWith.join(', ') })}`
      }`}
      aria-label={t('Open branch {name}', { name })}
      {...pressable(() => open(name), { stopPropagation: true })}
    >
      <Icon path={mdiSourceBranch} size={10} />
      <span className="brname">{cut(name, 22)}</span>
      {ahead > 0 && <b>↑{ahead}</b>}
      {behind > 0 && <i>↓{behind}</i>}
      {conflictsWith.length > 0 && <Icon path={mdiAlertOutline} size={10} />}
    </button>
  );
}

/* 行は覚えさせる。**200 行の一覧で、ホバーのたびに全行を描き直さない** ——
   描き直すのは、触れた行と繋がった行、そして弧の沈み方が変わる行だけでよい。 */
const IssueRow = memo(function IssueRow({
  row,
  index,
  edges,
  gutter,
  project,
  found,
  branch,
  unlocks,
  progress,
  axis,
  track,
  close,
  lag,
  showMilestone,
  nowMs,
  onHot,
  onLabel,
  onOpen,
}: IssueRowProps) {
  const t = useT();
  const nav = useNav();
  const issue = row.issue;
  const live = liveCount(found);
  const pop = popStyleOf(`i:${issue.id}`, nowMs);
  const labels = issue.labels ?? [];
  const typeColor = issueTypeColor(issue);
  const colors = labelColors(issue);
  const agg = subProgress(issue, issue.id === null ? undefined : progress.get(issue.id));
  const pull = leadPullRequest(issue);
  const milestone = showMilestone ? (issue.github?.milestone ?? null) : null;
  const comments = issue.github?.comments ?? 0;

  /* 作られた時刻と閉じた時刻。**輪は軸の外でも置き、フラグは置かない** —— どの課題にも
     始まりは在るので、輪を落とすと軸を狭めただけで「まだ無かった課題」の絵になる。閉じた
     時刻のほうは、そもそも答えない課題が在るので、端に寄せると開いている課題と見分けが付かない。
     読んでいる最中はどちらも描かない —— 輪だけが在る絵は「読み終えて何も起きていなかった」
     という別の答えだからである。 */
  const createdMs = Date.parse(issue.created_at ?? '');
  const quiet = track.kind === 'reading';
  const open = quiet ? null : openMarkOf(createdMs, axis);
  const flag = quiet ? null : closeFlagOf(close, axis);

  /* 堰き止めが解けてから作られるまでの待ち。軸と重なるところだけを引く。
     **輪と同じところで止める** —— どちらも一覧から出る観測なので、読んでいる最中に
     片方だけが残ると、まだ読んでいない行が待った長さを主張することになる。

     端が軸の外に在るなら、軸の端で止めて**その端をぼかす** —— `clampPct` が置いた位置は
     誰も観測していない時刻なので、硬い端で描くとそこで待ちが始まった(終わった)ことになる。

     待ちの右端は、この課題が作られた時刻そのものである。その時刻を読めない行に `lag` は
     組まれないので、ここで読めたかどうかを判じ直さない。 */
  const wait: RowWait | null =
    quiet || lag === null || lag.at > axis.t1 || createdMs < axis.t0
      ? null
      : {
          left: clampPct(atPct(lag.at, axis)),
          right: clampPct(atPct(createdMs, axis)),
          blocker: lag.blocker,
          days: lagDays(createdMs - lag.at),
          approx: lag.approx,
          softFrom: lag.at < axis.t0,
          softTo: createdMs > axis.t1,
        };
  const cutRegion = track.kind === 'read' ? track.cut : null;

  /* 観測した時刻を結ぶ線。**軸の上に置けるかどうかだけが幅で変わる** —— どの時刻とどの
     時刻を結ぶのかは軸を知らないところで決まっている。読み終えた行にしか両端は出ないので、
     読んでいる最中や読めなかった行がここで長さを持つことはない。 */
  const ends = trackEndsOf(Number.isFinite(createdMs) ? createdMs : null, track, close);
  const line = trackLineOf(ends, axis);

  /* 開いた時刻を読めず、イベントも 1 件も無い行。**空のトラックにしない** —— 置ける時刻が
     1 つも無いので線も輪も出ず、黙ると「読んで、何も起きていなかった」行と同じ絵になる。
     軸に置けないものは端で言う —— 期日の無いマイルストーンと同じ扱いである。 */
  const unplacedOpening = track.kind === 'read' && track.count === 0 && !Number.isFinite(createdMs);

  return (
    /* 行そのものを button にはできない。中にチップを持っており、button の中に button は
       置けない(ブラウザーが入れ子を解いて、グリッドごと崩す)。`role` と `tabIndex` だけを足す。 */
    // biome-ignore lint/a11y/useSemanticElements: 中にチップを持つ行は button にできない
    <div
      className={`issue-row${live >= 2 ? ' conflict' : ''}${pop === null ? '' : ' pop'}`}
      data-id={issue.id ?? ''}
      data-tok={[issue.id, ...found.map((worker) => worker.file)].filter(Boolean).join(' ')}
      style={pop === null ? undefined : { animationDelay: pop.animationDelay }}
      role="button"
      tabIndex={0}
      aria-label={t('Open issue {id}', { id: issue.id ?? '' })}
      onMouseEnter={() => onHot(issue.id, index)}
      onMouseLeave={() => onHot(null, index)}
      onFocus={() => onHot(issue.id, index)}
      onBlur={() => onHot(null, index)}
      {...pressable(() => {
        if (issue.id !== null) onOpen(issue.id);
      })}
    >
      {/* 弧の svg と、その幅を確保する空の要素で 1 組。svg はレイアウトの外に置いてあるので、
          列の幅は隣の空の要素が取る */}
      <EdgeGutter row={index} edges={edges} width={gutter} />
      <span style={{ width: gutter }} />
      <span className="iid" title={issue.id ?? ''}>
        {row.guides.map((carry, level) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: 階層の線は深さそのもので、位置が identity である
          <span key={`g${level}`} className={`tg${carry ? ' cont' : ''}`} />
        ))}
        {row.depth > 0 && <span className={`tg ${row.last ? 'end' : 'tee'}`} />}
        <span className="iid-t">{issue.id}</span>
      </span>
      <span className="ititle" title={issue.title ?? ''}>
        {issue.title !== null && <SubjectText text={issue.title} project={project} />}
        {agg !== null && agg.total >= 2 && (
          <span
            className="epic-prog"
            title={t('Child issue progress: {closed}/{total} closed', {
              closed: agg.closed,
              total: agg.total,
            })}
          >
            <span className="epic-bar">
              <i style={{ width: `${(agg.closed / agg.total) * 100}%` }} />
            </span>
            <b>
              {agg.closed}/{agg.total}
            </b>
          </span>
        )}
        {/* この課題を閉じる PR。**下書きと開いた PR を同じ見た目にしない** —
            前者はまだ見せるつもりが無く、後者は見てほしい、という別の待ち方である。 */}
        {pull !== null && (
          <span
            className={`prchip ${pull.is_draft ? 'draft' : pull.state.toLowerCase()}`}
            title={t('Pull request #{number} — {state}{review}{branch}', {
              number: pull.number,
              state: pull.is_draft ? t('draft') : pullStateLabel(t, pull.state),
              review:
                pull.review_decision === null ? '' : `, ${reviewLabel(t, pull.review_decision)}`,
              branch:
                pull.head_ref_name === null
                  ? ''
                  : ` ${t('on {branch}', { branch: pull.head_ref_name })}`,
            })}
          >
            #{pull.number}
            {pull.is_draft && ` ${t('draft')}`}
          </span>
        )}
        {/* マイルストーンへ渡れるようにしてある。**名前を出すだけにしない** —
            同じマイルストーンの他の課題を見るのに、一覧を目で探し直すことになる。 */}
        {milestone !== null && (
          <button
            type="button"
            className="mschip"
            title={t('Milestone: {title} — show just this milestone', {
              title: milestone.title,
            })}
            {...pressable(() => nav.gotoMilestone(milestone.title), { stopPropagation: true })}
          >
            {/* 単位の切り替えと同じ絵を使う。同じものを指しているので、同じ絵であるべきである */}
            <Icon path={mdiFlagOutline} size={10} />
            {cut(milestone.title, 18)}
          </button>
        )}
        {branch !== null && <Branch branch={branch} />}
        {/* 着手順で並べているときだけ、これを終わらせると何件が空くかを出す */}
        {unlocks !== null && unlocks > 0 && (
          <span className="iunlock" title={t('Finishing this frees {n}', { n: unlocks })}>
            +{unlocks}
          </span>
        )}
        {/* 掛かっている先を全部は見られなかった。**黙ると、辺の足りない絵が正しい絵として出る** */}
        {!issue.deps_complete && (
          <span
            className="wk-dup"
            title={t(
              'Some blocking issues are not shown — this issue has more dependencies than glasshive fetches',
            )}
          >
            <Icon path={mdiAlertOutline} size={10} /> {t('deps cut')}
          </span>
        )}
      </span>
      <span>
        <span className={`chip st-${issue.status}`}>{issue.status}</span>
      </span>
      <span>
        {issue.issue_type !== null && (
          <span
            className={`tchip${typeColor === null ? '' : ' tinted'}`}
            style={typeColor === null ? undefined : { ['--lc' as string]: typeColor }}
          >
            {issue.issue_type}
          </span>
        )}
      </span>
      <span className="ilabels" title={labels.join(', ')}>
        {labels.slice(0, MAX_LISTED_LABELS).map((label) => {
          /* 色は GitHub 側が付けた意味なので、こちらで塗り直さない。
             塗り潰さずに枠と文字だけに使うのは、3 つ並んだときに行が騒がしくならないためである。 */
          const color = colors.get(label);
          return (
            <button
              type="button"
              key={label}
              className={`lbl${color === undefined ? '' : ' tinted'}`}
              style={color === undefined ? undefined : { ['--lc' as string]: `#${color}` }}
              // ラベルは行のクリックを乗っ取らない。押したら、そのラベルで絞り込む
              {...pressable(() => onLabel(label), { stopPropagation: true })}
            >
              {cut(label, 20)}
            </button>
          );
        })}
        {labels.length > MAX_LISTED_LABELS && (
          <span className="g-more">+{labels.length - MAX_LISTED_LABELS}</span>
        )}
      </span>
      <span className="iworkers">
        {/* GitHub の担当は人の申告で、隣のチップはいま実際に動いているエージェントである。
         **同じ欄に混ぜない** — 混ぜると、担当が付いているだけの課題が動いて見える。 */}
        {issue.github.assignees.length > 0 && (
          <AvatarStack actors={issue.github.assignees} max={MAX_LISTED_FACES} />
        )}
        {found.slice(0, MAX_LISTED_WORKERS).map((worker) => (
          <AgentChip
            key={worker.file}
            file={worker.file}
            state={worker.state}
            label={worker.label}
            where={worker.where}
            via={viaLabel(t, worker)}
          />
        ))}
        {found.length > MAX_LISTED_WORKERS && (
          <span
            className="g-more"
            title={found
              .slice(MAX_LISTED_WORKERS)
              .map((worker) => worker.label)
              .join(', ')}
          >
            +{found.length - MAX_LISTED_WORKERS}
          </span>
        )}
        {live >= 2 && (
          <span className="wk-dup">
            <Icon path={mdiAlertOutline} size={10} /> {t('{n} concurrent', { n: live })}
          </span>
        )}
      </span>
      <span className="iupd">
        {comments > 0 && (
          <span
            className="icmt"
            title={t('{n, plural, one {# comment} other {# comments}}', { n: comments })}
          >
            <Icon path={mdiCommentOutline} size={10} /> {comments}
          </span>
        )}
        {formatSinceIso(t, issue.updated_at, nowMs)}
      </span>
      {/* 観測した時刻だけを置くトラック。GitHub は着手予定日も見積もりも返さないので、ここに
          計画された日程は 1 つも無い。マイルストーンの縦線はこのセルの背景が引いている。

          **子は絶対配置の `<i>` だけを平らに並べる。** 包む要素を足すと `subgrid` が切れる。
          並べた順がそのまま重なりの順で、線とハッチが下、点が上、フラグがいちばん上になる */}
      <span
        className={`gt st-${issue.status}${stateClass(track)}`}
        title={trackTitle(t, track, Number.isFinite(createdMs))}
      >
        {line !== null && ends !== null && (
          <i
            className={`gt-line${line.softFrom ? ' soft-from' : ''}${line.softTo ? ' soft-to' : ''}`}
            style={{ left: `${line.left}%`, width: `${line.width}%` }}
            title={lineTitle(t, ends, line, Number.isFinite(createdMs))}
          />
        )}
        {cutRegion !== null && (
          <i
            className={`gt-cut${cutRegion.softFrom ? ' soft-from' : ''}${cutRegion.softTo ? ' soft-to' : ''}`}
            style={{ left: `${cutRegion.left}%`, width: `${cutRegion.width}%` }}
            title={
              cutRegion.fromMs === null || cutRegion.softFrom
                ? t(
                    'Only the 30 most recent events were read — anything before {to} is not shown',
                    { to: absTime(cutRegion.toMs) },
                  )
                : t(
                    'Only the 30 most recent events were read — anything between {from} and {to} is not shown',
                    { from: absTime(cutRegion.fromMs), to: absTime(cutRegion.toMs) },
                  )
            }
          />
        )}
        {/* 堰き止めていた相手が片付いてから、この課題が作られるまで。**一覧では読めない
            のはここだけである** —— 依存が在ることは一覧にも出るが、待った長さは出ない。

            観測した時刻ではない端はぼかし、言葉でも言う —— 相手の閉じた時刻が代用のときと、
            端が軸の外に在って軸の端で止めているときの 2 つが在る */}
        {wait !== null && (
          <i
            className={`gt-lag${wait.approx ? ' approx' : ''}${wait.softFrom ? ' soft-from' : ''}${wait.softTo ? ' soft-to' : ''}`}
            style={{ left: `${wait.left}%`, width: `${wait.right - wait.left}%` }}
            title={lagTitle(t, wait)}
          />
        )}
        {/* 作られた時刻。軸の外に在るときは端に寄せ、**寄せたことを見た目で言う** ——
            硬い輪のままだと、幅を切り替えただけで開いた時刻が動いたことになる */}
        {open !== null && (
          <i
            className={openClass(open)}
            style={{ left: `${open.pct}%` }}
            title={openTitle(t, open)}
          />
        )}
        <TrackMarks track={track} />
        {/* 置ける時刻が 1 つも無い行。**黙って空にしない** —— 読んで何も起きていなかった行と、
            開いた時刻を読めなかった行が、同じ空のトラックになる */}
        {unplacedOpening && (
          <b
            className="gt-off left unplaced"
            title={t(
              'When this issue was opened could not be read, and no events are on record — nothing can be placed on this axis for it',
            )}
          >
            ?
          </b>
        )}
        {flag !== null && (
          <i
            className={`gt-flag${flag.approx ? ' approx' : ''}`}
            style={{ left: `${flag.pct}%` }}
            title={
              flag.approx
                ? t('Closed around {at}, taken from updated_at, so the close time is approximate', {
                    at: absTime(flag.at),
                  })
                : t('Closed {at}', { at: absTime(flag.at) })
            }
          />
        )}
      </span>
    </div>
  );
});
