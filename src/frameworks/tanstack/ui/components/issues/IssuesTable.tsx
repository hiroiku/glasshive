import { mdiAlertOutline, mdiPlay } from '@mdi/js';
import { useMemo, useRef } from 'react';
import type { IssueSummaryJson } from '~/interface/presenters/issues/issues.presenter.ts';
import type { ProjectJson } from '~/interface/presenters/sessions/tree.presenter.ts';
import {
  buildEdges,
  buildHierarchy,
  childProgress,
  type HierarchyRow,
  LANE_WIDTH,
  startRanker,
} from '../../derive/issueTree.ts';
import { liveCount, type WorkerIndex } from '../../derive/workers.ts';
import { cut, formatSinceIso } from '../../format.ts';
import { useNav } from '../../nav/NavContext.tsx';
import { popStyleOf, prunePops, touchFingerprint } from '../../phase.ts';
import { pressable } from '../../pressable.ts';
import { AgentChip } from '../chips/Chips.tsx';
import { Icon } from '../primitives/Icon.tsx';
import { SubjectText } from '../text/SubjectText.tsx';
import { EdgeGutter } from './EdgeGutter.tsx';

/* 課題の一覧。依存の弧・親子の階層・着手の順。

   9 列の格子で、行は subgrid で親の列に乗る。**行を包む要素を増やさないこと。**
   subgrid は直の子にしか効かない。

   台帳が言うことと、観測が言うことを、同じ行に並べてある。台帳の assignee は人の申告で、
   隣の札はいま実際に動いているエージェントである。**食い違いが見えることに意味がある。** */

/** 一度に並べる名札の数。溢れたぶんは数だけ添える */
const MAX_LISTED_WORKERS = 2;

/** 一度に並べる付箋の数 */
const MAX_LISTED_LABELS = 2;

/** 弧の余白の下限。頭の「▶ Start」が収まる幅 */
const MIN_GUTTER = 58;

export type IssueSortKey =
  | 'start'
  | 'id'
  | 'title'
  | 'status'
  | 'priority'
  | 'type'
  | 'labels'
  | 'assignee'
  | 'updated';

export interface IssueOrder {
  readonly key: IssueSortKey;
  readonly direction: 'asc' | 'desc';
}

const priorityClass = (priority: number | null): string =>
  priority === null ? 'px' : `p${Math.min(priority, 4)}`;

/* 並べ替えの鍵。**着手順だけは別の物差しである** — 他が課題の欄を読むのに対し、
   これは「次に取れるか」を読む。だから同じ表に混ぜず、頭の側で入れ替える。 */
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
  /** 閉じたものまで含む全量。束ねた課題の消化はここから数える */
  readonly all: readonly IssueSummaryJson[];
  readonly project: ProjectJson | undefined;
  readonly workers: WorkerIndex;
  readonly query: string;
  readonly onQuery: (query: string) => void;
  readonly status: string | null;
  readonly order: IssueOrder;
  readonly onSort: (key: IssueSortKey) => void;
  readonly nowMs: number;
  /** この巣を初めて描くか。初回は変化の光を当てない */
  readonly firstPaint: boolean;
}

export function IssuesTable({
  issues,
  all,
  project,
  workers,
  query,
  onQuery,
  status,
  order,
  onSort,
  nowMs,
  firstPaint,
}: IssuesTableProps) {
  const nav = useNav();
  const progress = useMemo(() => childProgress(all), [all]);
  const rankOf = useMemo(() => startRanker(issues), [issues]);

  /* 変化の光。絞り込む前の全件を見る — 絞りを掛けた結果だけを見ると、
     絞りから外れた行の変化が黙って落ちる。 */
  const seenRef = useRef(false);
  const first = firstPaint || !seenRef.current;
  seenRef.current = true;
  prunePops(nowMs);
  for (const issue of issues) {
    const found = workers.get(issue.id ?? '') ?? [];
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
  const shown = issues
    .filter((issue) => status === null || issue.status === status)
    .filter((issue) => {
      if (needle === '') return true;
      const found = workers.get(issue.id ?? '') ?? [];
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
        return (
          rankOf(a) - rankOf(b) ||
          (a.priority ?? 9) - (b.priority ?? 9) ||
          (b.updated_at ?? '').localeCompare(a.updated_at ?? '')
        );
      }
      const sign = order.direction === 'desc' ? -1 : 1;
      if (order.key === 'priority') return ((a.priority ?? 9) - (b.priority ?? 9)) * sign;
      return keyOf(a, order.key).localeCompare(keyOf(b, order.key), 'ja') * sign;
    });

  /* 着手順は「次に取る一列の待ち行列」である。階層に畳むと、待ち行列の順番が
     親の下へ散って読めなくなる。 */
  const rows: HierarchyRow[] =
    order.key === 'start'
      ? shown.map((issue) => ({ issue, depth: 0, guides: [], last: true }))
      : buildHierarchy(shown);
  const { edges, lanes } = buildEdges(rows.map((row) => row.issue));
  const gutter = Math.max(MIN_GUTTER, 18 + lanes * LANE_WIDTH);

  return (
    <div id="issues-list">
      <div className="issue-row head">
        {/* 弧の列の頭は着手順の並べ替えを兼ねる。依存が解けた open を優先度順に上へ */}
        <button
          type="button"
          className={`sortable dep-sort${order.key === 'start' ? ' sorted' : ''}`}
          style={{ width: gutter }}
          title="Sort by start order: open with all blocks cleared, by priority (exclusive with column sort)"
          onClick={() => onSort('start')}
        >
          <Icon path={mdiPlay} size={11} /> Start
        </button>
        <SortHead label="ID" sortKey="id" order={order} onSort={onSort} />
        <SortHead label="Title" sortKey="title" order={order} onSort={onSort} />
        <SortHead label="Status" sortKey="status" order={order} onSort={onSort} />
        <SortHead label="P" sortKey="priority" order={order} onSort={onSort} />
        <SortHead label="Type" sortKey="type" order={order} onSort={onSort} />
        <SortHead label="Labels" sortKey="labels" order={order} onSort={onSort} />
        <SortHead label="Assignee / Agents" sortKey="assignee" order={order} onSort={onSort} />
        <SortHead label="Updated" sortKey="updated" order={order} onSort={onSort} right />
      </div>
      {rows.length === 0 ? (
        <div className="empty">No matching issues</div>
      ) : (
        rows.map((row, index) => (
          <IssueRow
            key={row.issue.id ?? index}
            row={row}
            index={index}
            edges={edges}
            gutter={gutter}
            project={project}
            workers={workers}
            progress={progress}
            nowMs={nowMs}
            onLabel={onQuery}
            onOpen={() => {
              if (row.issue.id !== null) nav.openIssue(row.issue.id);
            }}
          />
        ))
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
  readonly workers: WorkerIndex;
  readonly progress: ReadonlyMap<string, { total: number; closed: number }>;
  readonly nowMs: number;
  readonly onLabel: (label: string) => void;
  readonly onOpen: () => void;
}

function IssueRow({
  row,
  index,
  edges,
  gutter,
  project,
  workers,
  progress,
  nowMs,
  onLabel,
  onOpen,
}: IssueRowProps) {
  const issue = row.issue;
  const found = workers.get(issue.id ?? '') ?? [];
  const live = liveCount(found);
  const pop = popStyleOf(`i:${issue.id}`, nowMs);
  const labels = issue.labels ?? [];
  const agg = issue.id === null ? undefined : progress.get(issue.id);

  return (
    /* 行そのものを button にはできない。中に札を持っており、button の中に button は
       置けない(ブラウザーが入れ子を解いて、格子ごと崩す)。役と焦点の順だけを足す。 */
    // biome-ignore lint/a11y/useSemanticElements: 中に押しどころを持つ行は button にできない
    <div
      className={`issue-row${live >= 2 ? ' conflict' : ''}${pop === null ? '' : ' pop'}`}
      data-tok={[issue.id, ...found.map((worker) => worker.file)].filter(Boolean).join(' ')}
      style={pop === null ? undefined : { animationDelay: pop.animationDelay }}
      role="button"
      tabIndex={0}
      aria-label={`Open issue ${issue.id ?? ''}`}
      {...pressable(onOpen)}
    >
      {/* 弧の svg と、その幅を確保する空きで 1 組。svg はレイアウトの外に置いてあるので、
          列の幅は隣の空きが取る */}
      <EdgeGutter row={index} edges={edges} width={gutter} />
      <span style={{ width: gutter }} />
      <span className="iid" title={issue.id ?? ''}>
        {row.guides.map((carry, level) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: 罫線は段そのもので、位置が identity である
          <span key={`g${level}`} className={`tg${carry ? ' cont' : ''}`} />
        ))}
        {row.depth > 0 && <span className={`tg ${row.last ? 'end' : 'tee'}`} />}
        <span className="iid-t">{issue.id}</span>
      </span>
      <span className="ititle" title={issue.title ?? ''}>
        {issue.title !== null && <SubjectText text={issue.title} project={project} />}
        {agg !== undefined && agg.total >= 2 && (
          <span
            className="epic-prog"
            title={`Child issue progress: ${agg.closed}/${agg.total} closed`}
          >
            <i style={{ width: `${(agg.closed / agg.total) * 100}%` }} />
            <b>
              {agg.closed}/{agg.total}
            </b>
          </span>
        )}
      </span>
      <span>
        <span className={`chip st-${issue.status}`}>{issue.status}</span>
      </span>
      <span>
        <span className={`pchip ${priorityClass(issue.priority)}`}>
          {issue.priority === null ? '—' : `P${issue.priority}`}
        </span>
      </span>
      <span>
        {issue.issue_type !== null && (
          <span className={`tchip t-${issue.issue_type}`}>{issue.issue_type}</span>
        )}
      </span>
      <span className="ilabels" title={labels.join(', ')}>
        {labels.slice(0, MAX_LISTED_LABELS).map((label) => (
          <button
            type="button"
            key={label}
            className="lbl"
            // 付箋は行の押しどころを乗っ取らない。押したら、その付箋で絞る
            {...pressable(() => onLabel(label), { stopPropagation: true })}
          >
            {cut(label, 20)}
          </button>
        ))}
        {labels.length > MAX_LISTED_LABELS && (
          <span className="g-more">+{labels.length - MAX_LISTED_LABELS}</span>
        )}
      </span>
      <span className="iworkers">
        {issue.assignee !== null && <span className="assg">{issue.assignee}</span>}
        {found.slice(0, MAX_LISTED_WORKERS).map((worker) => (
          <AgentChip
            key={worker.file}
            file={worker.file}
            state={worker.state}
            label={worker.label}
            where={worker.where}
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
        {issue.status === 'in_progress' && live === 0 && (
          <span className="wk-dup" title="in_progress but no live agent">
            <Icon path={mdiAlertOutline} size={10} /> stalled
          </span>
        )}
      </span>
      <span className="iupd">{formatSinceIso(issue.updated_at, nowMs)}</span>
    </div>
  );
}
