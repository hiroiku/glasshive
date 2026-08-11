import {
  mdiAlertOutline,
  mdiCommentOutline,
  mdiFlagOutline,
  mdiPlay,
  mdiSourceBranch,
} from '@mdi/js';
import { Fragment, memo, useCallback, useMemo, useRef } from 'react';
import type { IssueSummaryJson } from '~/interface/presenters/issues/issues.presenter.ts';
import type { ProjectJson } from '~/interface/presenters/sessions/tree.presenter.ts';
import { buildDependencyGraph, startOrder } from '../../derive/dependencyGraph.ts';
import { labelColors, leadPullRequest, subProgress } from '../../derive/githubIssue.ts';
import {
  formatGanttTick,
  type GanttAxis,
  type GanttGuide,
  type GanttSpan,
  type GanttWindow,
  ganttAxis,
  ganttGuides,
  ganttSpan,
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
import { milestoneBands } from '../../derive/milestones.ts';
import { DAY_MS } from '../../derive/timeWindow.ts';
import {
  liveCount,
  type MatchedWorker,
  viaLabel,
  type WorkerIndex,
  workersOn,
} from '../../derive/workers.ts';
import { type BranchState, branchStateOf, type WorkJoin } from '../../derive/workJoin.ts';
import { absTime, cut, formatDue, formatSinceIso } from '../../format.ts';
import { useNav } from '../../nav/NavContext.tsx';
import type { IssueGroup } from '../../nav/search.ts';
import { popStyleOf, prunePops, touchFingerprint } from '../../phase.ts';
import { pressable } from '../../pressable.ts';
import { AgentChip } from '../chips/Chips.tsx';
import { AvatarStack } from '../primitives/Avatar.tsx';
import { Icon } from '../primitives/Icon.tsx';
import { SubjectText } from '../text/SubjectText.tsx';
import { EdgeGutter } from './EdgeGutter.tsx';

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

/* 軸の上での位置を百分率で。**軸の外は端で止めずに、呼ぶ側が描くのをやめる。**
   端へ寄せたバーは、位置も長さも観測していない値を言うことになる。 */
const atPct = (at: number, axis: GanttAxis): number => ((at - axis.t0) / (axis.t1 - axis.t0)) * 100;

const clampPct = (pct: number): number => Math.min(100, Math.max(0, pct));

/** 待った長さ。日より細かくは言わない —— 課題の待ちは日の単位で読むものである */
const lagDays = (ms: number): number => Math.max(0, Math.round(ms / DAY_MS));

/** 課題 1 件ぶんのタイムライン。バーと、直前の堰き止めから空くまでの待ち */
interface RowGantt {
  readonly span: GanttSpan;
  /** 最後に片付いた堰き止めの相手と、その終わり。待ちが無ければ `null` */
  readonly lag: { readonly at: number; readonly blocker: string } | null;
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
  group,
  nowMs,
  firstPaint,
}: IssuesTableProps) {
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
     着手順を選んだままマイルストーンで束ねれば、「この区切りで次に取るのはどれか」が読める。 */
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
        title: 'Ready now',
        note: `${queue.startable.length} waiting on nothing`,
        tone: 'ready',
        issues: queue.startable.map((node) => node.issue),
      },
      {
        title: 'Waiting',
        note: `${queue.waiting.length} free up as the ones above land`,
        tone: '',
        issues: queue.waiting.map((node) => node.issue),
      },
      {
        title: 'Caught in a cycle',
        note: ring,
        tone: 'caught',
        issues: queue.caught.map((node) => node.issue),
      },
      { title: 'Closed', note: `${closed.length} done`, tone: 'done', issues: closed },
    ].filter((band) => band.issues.length > 0);
    return { bands, unlocks, complete: graph.complete };
  }, [group, order.key, shown]);

  /* マイルストーンの束。見出しに出す件数は、**出ている課題だけで数える** ——
     絞り込んだ一覧の見出しに絞る前の件数を出すと、見出しと行が食い違う。 */
  const grouped = useMemo(() => {
    if (group !== 'milestone') return null;
    return milestoneBands(shown).map((band) => ({
      title: band.title ?? 'No milestone',
      note:
        band.dueOn === null
          ? `${band.open} of ${band.total} open`
          : `${formatDue(band.dueOn, nowMs)} · ${band.open} of ${band.total} open`,
      tone: band.title === null ? 'done' : '',
      issues: band.issues,
    }));
  }, [group, shown, nowMs]);

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
      { found: readonly MatchedWorker[]; branch: BranchState | null }
    >();
    for (const row of rows) {
      index.set(row.issue.id ?? '', {
        found: workersOn(workers, row.issue),
        branch: join === undefined ? null : branchStateOf(row.issue, join.tips, join.conflicts),
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

  /* バーと待ちの線を、行の外で 1 度だけ組む。待ちを引くには堰き止めている相手のバーが要り、
     それは他の行のものなので、行の中では組めない。 */
  const bars = useMemo(() => {
    const spans = new Map<string, GanttSpan>();
    for (const row of rows) {
      const span = ganttSpan(row.issue, nowMs);
      if (span !== null) spans.set(row.issue.id, span);
    }
    const index = new Map<string, RowGantt>();
    for (const row of rows) {
      const span = spans.get(row.issue.id);
      if (span === undefined) continue;
      /* 待ちを決めるのは、いちばん後に終わる相手である。**先に片付いた相手を採ると、
         まだ他の相手が塞いでいた期間まで「空いていた」と描くことになる。** */
      let latest: RowGantt['lag'] = null;
      for (const dependency of row.issue.deps) {
        if (dependency.type !== 'blocks') continue;
        const on = dependency.on;
        if (on === null || on === row.issue.id) continue;
        const other = spans.get(on);
        if (other === undefined) continue;
        if (latest === null || other.to > latest.at) latest = { at: other.to, blocker: on };
      }
      // 相手がこの課題の始まりより後に終わるなら、待った時間は無い。逆向きの線は引かない
      const lag = latest !== null && latest.at < span.from ? latest : null;
      index.set(row.issue.id, { span, lag });
    }
    return index;
  }, [rows, nowMs]);

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

  return (
    <div id="issues-list" ref={listRef}>
      <div className="issue-row head">
        {/* 弧の列の見出しは着手順の並べ替えを兼ねる。依存が解けた open を上へ */}
        <button
          type="button"
          className={`sortable dep-sort${order.key === 'start' ? ' sorted' : ''}`}
          style={{ width: gutter }}
          title="Sort by start order: open with all blocks cleared, most recently updated first (exclusive with column sort)"
          onClick={() => onSort('start')}
        >
          <Icon path={mdiPlay} size={11} /> Start
        </button>
        <SortHead label="ID" sortKey="id" order={order} onSort={onSort} />
        <SortHead label="Title" sortKey="title" order={order} onSort={onSort} />
        <SortHead label="Status" sortKey="status" order={order} onSort={onSort} />
        <SortHead label="Type" sortKey="type" order={order} onSort={onSort} />
        <SortHead label="Labels" sortKey="labels" order={order} onSort={onSort} />
        <SortHead label="Assignee / Agents" sortKey="assignee" order={order} onSort={onSort} />
        <SortHead label="Updated" sortKey="updated" order={order} onSort={onSort} right />
        {/* 目盛りだけの見出し。この列に並べ替えは無いので、押せる形にしない */}
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
        </span>
      </div>
      {rows.length === 0 ? (
        <div className="empty">No matching issues</div>
      ) : (
        rows.map((row, index) => {
          const band = bandAt.get(index);
          const id = row.issue.id ?? '';
          return (
            /* Fragment は DOM を作らないので、`subgrid` は親の直の子のまま保たれる */
            <Fragment key={id === '' ? index : id}>
              {band !== undefined && (
                <div className={`iband${band.tone === '' ? '' : ` ${band.tone}`}`}>
                  <span>{band.title}</span>
                  <em>{band.note}</em>
                </div>
              )}
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
                guides={guides}
                gantt={bars.get(id) ?? null}
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
        <div className="iband cut">
          <span>Some blocking issues were not fetched</span>
          <em>this order may be missing constraints</em>
        </div>
      )}
    </div>
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
  readonly branch: BranchState | null;
  /** これを終わらせると着手できるようになる数。着手順で並べているときだけ */
  readonly unlocks: number | null;
  readonly progress: ReadonlyMap<string, { total: number; closed: number }>;
  /* タイムラインの軸とガイド。**全行で同じものを見る** —— 行ごとに軸を取ると、
     同じ長さのバーが行によって別の期間を指す。 */
  readonly axis: GanttAxis;
  readonly guides: readonly GanttGuide[];
  /** この課題のバー。`created_at` を読めなければ `null` で、バーそのものが出ない */
  readonly gantt: RowGantt | null;
  /* マイルストーンの名前を、行にも出すか。**束ねているときは出さない** ——
     束の見出しが既に言っているので、行ごとに繰り返すと同じことが 2 度並ぶ。 */
  readonly showMilestone: boolean;
  readonly nowMs: number;
  /** 触れた・離れたを伝える。沈めるのは DOM の側なので、行はここから何も受け取らない */
  readonly onHot: (id: string | null, index: number) => void;
  readonly onLabel: (label: string) => void;
  readonly onOpen: (id: string) => void;
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
  guides,
  gantt,
  showMilestone,
  nowMs,
  onHot,
  onLabel,
  onOpen,
}: IssueRowProps) {
  const nav = useNav();
  const issue = row.issue;
  const live = liveCount(found);
  const pop = popStyleOf(`i:${issue.id}`, nowMs);
  const labels = issue.labels ?? [];
  const colors = labelColors(issue);
  const agg = subProgress(issue, issue.id === null ? undefined : progress.get(issue.id));
  const pull = leadPullRequest(issue);
  const milestone = showMilestone ? (issue.github?.milestone ?? null) : null;
  const comments = issue.github?.comments ?? 0;

  /* バーの両端。軸からはみ出たぶんは切り落とし、丸ごと外に在るものは描かない。
   **端へ寄せたバーは、位置も長さも観測していない値を言う。** */
  const span = gantt?.span ?? null;
  const bar =
    span === null || span.to < axis.t0 || span.from > axis.t1
      ? null
      : {
          left: clampPct(atPct(span.from, axis)),
          right: clampPct(atPct(span.to, axis)),
        };
  const wait = gantt?.lag ?? null;
  const lag =
    wait === null || span === null || wait.at > axis.t1 || span.from < axis.t0
      ? null
      : {
          left: clampPct(atPct(wait.at, axis)),
          right: clampPct(atPct(span.from, axis)),
          blocker: wait.blocker,
          days: lagDays(span.from - wait.at),
        };

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
      aria-label={`Open issue ${issue.id ?? ''}`}
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
          // biome-ignore lint/suspicious/noArrayIndexKey: 罫線は深さそのもので、位置が identity である
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
            title={`Child issue progress: ${agg.closed}/${agg.total} closed`}
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
            title={`Pull request #${pull.number} — ${pull.is_draft ? 'draft' : pull.state.toLowerCase()}${
              pull.review_decision === null ? '' : `, ${pull.review_decision.toLowerCase()}`
            }${pull.head_ref_name === null ? '' : ` on ${pull.head_ref_name}`}`}
          >
            #{pull.number}
            {pull.is_draft && ' draft'}
          </span>
        )}
        {/* 区切りへ渡れるようにしてある。**名前を出すだけにしない** —
            同じ区切りの他の課題を見るのに、一覧を目で探し直すことになる。 */}
        {milestone !== null && (
          <button
            type="button"
            className="mschip"
            title={`Milestone: ${milestone.title} — show just this milestone`}
            {...pressable(() => nav.gotoMilestone(milestone.title), { stopPropagation: true })}
          >
            {/* 単位の切り替えと同じ絵を使う。同じものを指しているので、同じ絵であるべきである */}
            <Icon path={mdiFlagOutline} size={10} />
            {cut(milestone.title, 18)}
          </button>
        )}
        {/* PR が乗っているブランチの、手元での状態。**課題の欄に git を持ち込む唯一の場所** —
            繋いでいるのは PR で、推測ではない。

            名前を出して、押せるようにしてある。**遅れの数だけでは、どのブランチの話なのかが
            分からない** —— 課題からブランチへ渡れて初めて、2 つの単位が繋がる。 */}
        {branch !== null && (
          <button
            type="button"
            className={`brstate${branch.conflictsWith.length > 0 ? ' warn' : ''}`}
            title={`${branch.name} — ${branch.ahead} ahead, ${branch.behind} behind${
              branch.worktree === null ? '' : ` · worktree ${branch.worktree}`
            }${
              branch.conflictsWith.length === 0
                ? ''
                : ` · touches the same files as ${branch.conflictsWith.join(', ')}`
            }`}
            aria-label={`Open branch ${branch.name}`}
            {...pressable(() => nav.openRef(branch.name, branch.name), { stopPropagation: true })}
          >
            <Icon path={mdiSourceBranch} size={10} />
            <span className="brname">{cut(branch.name, 22)}</span>
            {branch.ahead > 0 && <b>↑{branch.ahead}</b>}
            {branch.behind > 0 && <i>↓{branch.behind}</i>}
            {branch.conflictsWith.length > 0 && <Icon path={mdiAlertOutline} size={10} />}
          </button>
        )}
        {/* 着手順で並べているときだけ、これを終わらせると何件が空くかを出す */}
        {unlocks !== null && unlocks > 0 && (
          <span className="iunlock" title={`Finishing this frees ${unlocks}`}>
            +{unlocks}
          </span>
        )}
        {/* 掛かっている先を全部は見られなかった。**黙ると、辺の足りない絵が正しい絵として出る** */}
        {!issue.deps_complete && (
          <span
            className="wk-dup"
            title="Some blocking issues are not shown — this issue has more dependencies than glasshive fetches"
          >
            <Icon path={mdiAlertOutline} size={10} /> deps cut
          </span>
        )}
      </span>
      <span>
        <span className={`chip st-${issue.status}`}>{issue.status}</span>
      </span>
      <span>
        {issue.issue_type !== null && (
          <span
            className={`tchip t-${issue.issue_type}${issue.github?.issue_type_color == null ? '' : ' tinted'}`}
            style={
              issue.github?.issue_type_color == null
                ? undefined
                : { ['--lc' as string]: `#${issue.github.issue_type_color}` }
            }
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
            via={viaLabel(worker)}
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
            <Icon path={mdiAlertOutline} size={10} /> {live} concurrent
          </span>
        )}
      </span>
      <span className="iupd">
        {comments > 0 && (
          <span className="icmt" title={`${comments} comments`}>
            <Icon path={mdiCommentOutline} size={10} /> {comments}
          </span>
        )}
        {formatSinceIso(issue.updated_at, nowMs)}
      </span>
      {/* 観測した時刻だけを引くタイムライン。GitHub は着手予定日も見積もりも返さないので、
          ここに計画された日程は 1 本も無い */}
      <span className="gt">
        {/* 区切りの期日。**素材の中で唯一先を指す日付なので、現在の線とは分けて描く。**
            どの行にも同じ位置で出るので、一覧を下へ辿るときの縦の目印になる */}
        {guides.map((guide) => (
          <i
            key={guide.title}
            className="gt-guide"
            style={{ left: `${clampPct(atPct(guide.at, axis))}%` }}
            title={`Milestone ${guide.title} — due ${absTime(guide.at)}`}
          />
        ))}
        {nowMs >= axis.t0 && nowMs <= axis.t1 && (
          <i
            className="gt-now"
            style={{ left: `${clampPct(atPct(nowMs, axis))}%` }}
            title={`Now — ${absTime(nowMs)}`}
          />
        )}
        {/* 堰き止めていた相手が片付いてから、この課題が作られるまで。**一覧では読めない
            のはここだけである** —— 依存が在ることは一覧にも出るが、待った長さは出ない */}
        {lag !== null && (
          <i
            className="gt-lag"
            style={{ left: `${lag.left}%`, width: `${lag.right - lag.left}%` }}
            title={`Waiting on ${lag.blocker} — ${lag.days}d from ${lag.blocker} ending to this issue being created`}
          />
        )}
        {bar !== null && span !== null && (
          <i
            className={`gt-bar st-${issue.status} ${span.closed ? 'done' : 'live'}`}
            style={{ left: `${bar.left}%`, width: `${bar.right - bar.left}%` }}
            title={
              span.closed
                ? `Created ${absTime(span.from)} — closed around ${absTime(span.to)}, taken from updated_at, so the close time is approximate`
                : `Created ${absTime(span.from)} — still open`
            }
          />
        )}
      </span>
    </div>
  );
});
