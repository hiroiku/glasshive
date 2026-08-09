import { useQuery } from '@tanstack/react-query';
import {
  type ColumnDef,
  type ExpandedState,
  flexRender,
  getCoreRowModel,
  getExpandedRowModel,
  getSortedRowModel,
  type Row,
  type SortingState,
  useReactTable,
} from '@tanstack/react-table';
import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import type {
  ProjectJson,
  SessionJson,
  SubagentJson,
} from '~/interface/presenters/sessions/tree.presenter.ts';
import {
  visibleSessions,
  visibleSubagents,
} from '~/interface/presenters/sessions/visibility.presenter.ts';
import { searchQuery } from '../../../queries/sessions.query.ts';
import { cut, formatSinceIso, formatTokens, modelShort, worktreeName } from '../../format.ts';
import { useNav } from '../../nav/NavContext.tsx';
import { popStyleOf, prunePops, touchFingerprint } from '../../phase.ts';
import { pressable } from '../../pressable.ts';
import {
  type Axis,
  axisOf,
  domainOf,
  formatTick,
  niceTicks,
  type Scale,
  type TimelineNode,
} from '../../timeline/axis.ts';
import { IssueChip, RefChip } from '../chips/Chips.tsx';
import { Dot } from '../primitives/Dot.tsx';
import { TlBar } from '../timeline/TlBar.tsx';
import { AgentsToolbar } from './AgentsToolbar.tsx';

/* エージェントの表。11 本の列と、親子を結ぶ線と、時間帯の引き寄せ。

   **これを分けない。** 列の定義・入れ子の格子・結ぶ線・引き寄せは、行の高さ(`rowPitch`)と
   時間の列の位置(`tlGeom`)と軸(`axis`)で強く結び合っている。切り分けると、
   その 3 つを部品の間で行き来させることになり、どこで測ってどこで使うのかが読めなくなる。

   **`#tree-pane` の直の子に包みを挟まない。** 列を決めているのは `#tree-pane` で、
   帯も行も入れ子の格子として親の列を borrow している。1 枚挟むと列が揃わなくなる。 */

type AgentNode = SessionJson | SubagentJson;

type AgentRow =
  | {
      readonly rid: string;
      readonly kind: 'session';
      readonly node: SessionJson;
      readonly subs: AgentRow[];
    }
  | {
      readonly rid: string;
      readonly kind: 'subagent';
      readonly node: SubagentJson;
    };

/** 並べ替えたときの様子の順。動いているものが先 */
const STATE_ORDER: Record<string, number> = { active: 0, waiting: 1, ended: 2 };

const EFFORT_ORDER: Record<string, number> = {
  low: 0,
  medium: 1,
  high: 2,
  xhigh: 3,
  max: 4,
};

/** 表の題として出す名前の上限 */
const MAX_LABEL_CHARS = 60;

/** これだけ動きが無い待機は「要注意」として拾う */
const STALE_WAIT_MS = 30 * 60_000;

/** 1 つの親から引く線の上限。これを超えると線が束になって読めない */
const MAX_CONNECTIONS_PER_PARENT = 12;

const labelOf = (row: AgentRow): string =>
  row.kind === 'session' ? (row.node.title ?? row.node.id.slice(0, 8)) : row.node.label;

/* 課題まわりの一言。押せる札にする前の、並べ替えのための素の字 */
function bdOf(row: AgentRow): string {
  if (row.kind === 'subagent') return row.node.issue ?? '';
  const parts: string[] = [];
  if (row.node.actor !== null) parts.push(row.node.actor);
  if (row.node.issues.length > 0) parts.push(row.node.issues.slice(0, 2).join(' '));
  return parts.join(' · ');
}

/** 見えている欄への部分一致(大小を問わない) */
const hits = (query: string, haystack: readonly (string | null | undefined)[]): boolean =>
  haystack.some((value) => value?.toLowerCase().includes(query) === true);

export interface AgentsTableProps {
  readonly project: ProjectJson;
  readonly showAll: boolean;
  readonly nowMs: number;
  /** いま会話の窓に出ている正本。行を光らせるためだけに使う */
  readonly selectedFile: string | null;
  /** この巣を初めて描くか。初回は変化の光を当てない */
  readonly firstPaint: boolean;
  readonly query: string;
  readonly onQuery: (query: string) => void;
  readonly attention: boolean;
  readonly onAttention: (attention: boolean) => void;
  readonly sorting: SortingState;
  readonly onSorting: (sorting: SortingState) => void;
}

export function AgentsTable({
  project,
  showAll,
  nowMs,
  selectedFile,
  firstPaint,
  query,
  onQuery,
  attention,
  onAttention,
  sorting,
  onSorting,
}: AgentsTableProps) {
  const nav = useNav();
  const [expanded, setExpanded] = useState<ExpandedState>(true);
  /* 深い探しは道の印に載せない。**開いた途端に数百の正本を末尾まで開くことになる。**
     しおりを踏んだだけでそれが走るのは、観るだけの道具の振る舞いではない。 */
  const [deep, setDeep] = useState(false);
  const [scale, setScale] = useState<Scale>('auto');
  // 手で選んだ絶対の時間帯。null なら Auto か決め打ちの幅(右端 = 最新)に従う
  const [picked, setPicked] = useState<Axis | null>(null);

  const trimmed = query.trim().toLowerCase();
  const deepSearch = useQuery({
    ...searchQuery(project.id, trimmed),
    enabled: deep && trimmed.length >= 2,
  });
  const deepFiles = useMemo(() => {
    if (!deep) return null;
    const found = deepSearch.data;
    // 探しに行けなかったときは絞らない。空の結果として扱うと、全部が消えて「無い」に見える
    if (found === undefined || found === null || !found.ok) return null;
    return new Set(found.body.files);
  }, [deep, deepSearch.data]);

  /* 結ぶ線を行の境目まで正しく届かせるための行の実の高さと、
     全行を貫く時間の格子を敷くための時間の列の位置と幅を測る。 */
  const rowsRef = useRef<HTMLDivElement>(null);
  const [rowPitch, setRowPitch] = useState(26);
  const [tlGeom, setTlGeom] = useState({ left: 0, width: 0 });
  useLayoutEffect(() => {
    const rowsEl = rowsRef.current;
    const rowEl = rowsEl?.querySelector('.row');
    const tlEl = rowsEl?.querySelector('.row .tl');
    if (rowsEl === null || rowsEl === undefined || rowEl == null || tlEl == null) return;
    const height = rowEl.getBoundingClientRect().height;
    if (height > 0 && Math.abs(height - rowPitch) > 0.25) setRowPitch(height);
    const rowsBox = rowsEl.getBoundingClientRect();
    const tlBox = tlEl.getBoundingClientRect();
    const left = tlBox.left - rowsBox.left;
    if (Math.abs(left - tlGeom.left) > 0.5 || Math.abs(tlBox.width - tlGeom.width) > 0.5) {
      setTlGeom({ left, width: tlBox.width });
    }
  });

  const data = useMemo<AgentRow[]>(() => {
    const idleMs = (session: SessionJson) => nowMs - (Date.parse(session.last_activity) || 0);
    const needsAttention = (session: SessionJson) =>
      session.awaiting === 'user' ||
      (session.state === 'waiting' && idleMs(session) > STALE_WAIT_MS);

    const rows: AgentRow[] = [];
    for (const session of visibleSessions(project, showAll, nowMs)) {
      if (attention && !needsAttention(session)) continue;
      let subs = visibleSubagents(session, showAll, nowMs);

      if (deepFiles !== null) {
        // 深い探し: 中身が当たった正本だけを残す
        if (!deepFiles.has(session.file)) {
          subs = subs.filter((subagent) => deepFiles.has(subagent.file));
          if (subs.length === 0) continue;
        }
      } else if (trimmed !== '') {
        const own = hits(trimmed, [
          session.title,
          session.id,
          session.actor,
          session.git_branch,
          session.current,
          worktreeName(session.cwd),
          ...session.issues,
        ]);
        if (!own) {
          // 親が当たらなくても、当たった子は親ごと残す
          subs = subs.filter((subagent) =>
            hits(trimmed, [
              subagent.label,
              subagent.issue,
              subagent.git_branch,
              subagent.current,
              worktreeName(subagent.cwd),
            ]),
          );
          if (subs.length === 0) continue;
        }
      }

      rows.push({
        rid: `s:${session.file}`,
        kind: 'session',
        node: session,
        subs: subs.map((subagent) => ({
          rid: `a:${subagent.file}`,
          kind: 'subagent' as const,
          node: subagent,
        })),
      });
    }
    return rows;
  }, [project, showAll, nowMs, attention, trimmed, deepFiles]);

  /* 変わった行を拾うのは、**絞り込みで見えていない行も含めて**である。
     見えている行だけを見比べると、絞りを切り替えただけで全部が「変わった」ことになる。 */
  useMemo(() => {
    prunePops(nowMs);
    for (const session of project.sessions) {
      const current = session.state === 'active' ? (session.current ?? '') : '';
      touchFingerprint(
        `s:${session.file}`,
        [
          session.state,
          session.awaiting ?? '',
          session.title ?? '',
          session.model ?? '',
          session.effort ?? '',
          session.actor ?? '',
          session.issues.join(','),
          session.git_branch ?? '',
          current,
        ].join('|'),
        firstPaint,
        nowMs,
      );
      for (const subagent of session.subagents) {
        const subCurrent = subagent.state === 'active' ? (subagent.current ?? '') : '';
        touchFingerprint(
          `a:${subagent.file}`,
          [
            subagent.state,
            subagent.label,
            subagent.model ?? '',
            subagent.effort ?? '',
            subagent.issue ?? '',
            worktreeName(subagent.cwd),
            subagent.git_branch ?? '',
            subCurrent,
          ].join('|'),
          firstPaint,
          nowMs,
        );
      }
    }
  }, [project, firstPaint, nowMs]);

  const columns = useMemo<ColumnDef<AgentRow>[]>(
    () => [
      {
        id: 'name',
        header: 'Session / Subagent',
        accessorFn: (row) => labelOf(row).toLowerCase(),
      },
      {
        id: 'state',
        header: 'Status',
        accessorFn: (row) => STATE_ORDER[row.node.state] ?? 9,
      },
      {
        id: 'model',
        header: 'Model',
        accessorFn: (row) => modelShort(row.node.model),
      },
      {
        id: 'effort',
        header: 'Effort',
        accessorFn: (row) => EFFORT_ORDER[row.node.effort ?? ''] ?? -1,
        sortDescFirst: true,
      },
      {
        id: 'tokens',
        header: 'Tokens',
        accessorFn: (row) => row.node.tokens ?? -1,
        sortDescFirst: true,
      },
      { id: 'bd', header: 'bd', accessorFn: bdOf },
      {
        id: 'worktree',
        header: 'Worktree',
        accessorFn: (row) => worktreeName(row.node.cwd),
      },
      {
        id: 'branch',
        header: 'Branch',
        accessorFn: (row) => row.node.git_branch ?? '',
      },
      {
        id: 'now',
        header: 'Now',
        accessorFn: (row) => (row.node.state === 'active' ? (row.node.current ?? '') : ''),
      },
      {
        id: 'updated',
        header: 'Updated',
        accessorFn: (row) => Date.parse(row.node.last_activity) || 0,
        sortDescFirst: true,
      },
      {
        id: 'timeline',
        header: '',
        accessorFn: (row) => Date.parse(row.node.started ?? row.node.last_activity) || 0,
      },
    ],
    [],
  );

  const table = useReactTable({
    data,
    columns,
    state: { sorting, expanded },
    onSortingChange: (updater) => {
      onSorting(typeof updater === 'function' ? updater(sorting) : updater);
    },
    onExpandedChange: setExpanded,
    getRowId: (row) => row.rid,
    getSubRows: (row) => (row.kind === 'session' ? row.subs : undefined),
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getExpandedRowModel: getExpandedRowModel(),
    enableSortingRemoval: false,
  });

  const rows = table.getRowModel().rows;
  const nodes = useMemo<TimelineNode[]>(() => rows.map((row) => row.original.node), [rows]);
  const autoAxis = useMemo(() => axisOf(nodes, scale, nowMs), [nodes, scale, nowMs]);
  const axis = picked ?? autoAxis;
  const span = axis.t1 - axis.t0;
  const ticks = useMemo(() => niceTicks(axis.t0, axis.t1), [axis.t0, axis.t1]);
  const domain = useMemo(() => domainOf(nodes, axis, nowMs), [nodes, axis, nowMs]);

  /* 手で打ち込んだ端は最大限そのまま活かす。矛盾したら、もう一方を 1 分の幅を保って追わせる。 */
  const commitTime = (which: 't0' | 't1') => (at: number) => {
    let t0 = axis.t0;
    let t1 = axis.t1;
    if (which === 't0') {
      t0 = at;
      if (t1 < t0 + 60_000) t1 = t0 + 60_000;
    } else {
      t1 = at;
    }
    if (t1 > nowMs) t1 = nowMs;
    if (t0 > t1 - 60_000) t0 = t1 - 60_000;
    setPicked({ t0, t1 });
  };

  /* 帯の上をなぞって時間帯を動かす。動かすのは選んだ窓だけで、
     スライダーも目盛りも札も同じ軸を読んでいるので、勝手に揃う。 */
  const didPanRef = useRef(false);
  const onPanStart = (event: React.MouseEvent) => {
    if (event.button !== 0) return;
    const width = (event.currentTarget as HTMLElement).getBoundingClientRect().width;
    const x0 = event.clientX;
    const t0 = axis.t0;
    const t1 = axis.t1;
    const spanMs = t1 - t0;
    didPanRef.current = false;

    const move = (moved: MouseEvent) => {
      const dx = moved.clientX - x0;
      // 素の押しは行を開く操作のまま。動かす気があったときだけ引き寄せに変える
      if (!didPanRef.current && Math.abs(dx) < 3) return;
      didPanRef.current = true;
      document.body.classList.add('tl-panning');
      const delta = (-dx / width) * spanMs;
      let na = t0 + delta;
      let nb = t1 + delta;
      if (na < domain.t0) {
        na = domain.t0;
        nb = domain.t0 + spanMs;
      }
      if (nb > domain.t1) {
        nb = domain.t1;
        na = domain.t1 - spanMs;
      }
      setPicked({ t0: na, t1: nb });
    };
    const up = () => {
      document.removeEventListener('mousemove', move);
      document.removeEventListener('mouseup', up);
      document.body.classList.remove('tl-panning');
    };
    document.addEventListener('mousemove', move);
    document.addEventListener('mouseup', up);
  };

  /* 親から子への結び。行きは親の帯から子の帯の始まりへ、帰りは子の終わりから親へ。
     向きは矢印が担う。**窓の外の柱は端へ吸着させず、そのまま描かない。** */
  const connections = useMemo(() => {
    const inWindow = (x: number) => (x >= 0 && x <= 99.8 ? x : null);
    const list: {
      parent: number;
      child: number;
      xs: number | null;
      xe: number | null;
    }[] = [];
    const perParent = new Map<number, number>();

    rows.forEach((row: Row<AgentRow>, index: number) => {
      if (row.depth !== 1) return;
      let parent = index - 1;
      while (parent >= 0 && rows[parent]?.depth !== 0) parent -= 1;
      if (parent < 0) return;
      const drawn = (perParent.get(parent) ?? 0) + 1;
      perParent.set(parent, drawn);
      // 開きすぎた木では結びを諦める。読めない線は情報ではない
      if (drawn > MAX_CONNECTIONS_PER_PARENT) return;

      const node = row.original.node;
      const started = Date.parse(node.started ?? node.last_activity) || axis.t0;
      const xs = inWindow(((started - axis.t0) / span) * 100);
      let xe: number | null = null;
      if (node.state !== 'active') {
        const ended = Date.parse(node.last_activity) || started;
        xe = inWindow(((ended - axis.t0) / span) * 100);
      }
      if (xs === null && xe === null) return;
      list.push({ parent, child: index, xs, xe });
    });
    return list;
  }, [rows, axis, span]);

  const headers = table.getHeaderGroups()[0]?.headers ?? [];
  const midOf = (row: number) => row * rowPitch + rowPitch / 2;

  return (
    <div id="tree-pane">
      <AgentsToolbar
        query={query}
        onQuery={onQuery}
        deep={deep}
        onDeep={setDeep}
        attention={attention}
        onAttention={onAttention}
        scale={scale}
        onScale={(next) => {
          setScale(next);
          setPicked(null);
        }}
        picked={picked !== null}
        axis={axis}
        domain={domain}
        onRange={(t0, t1) => setPicked({ t0, t1 })}
        onCommitTime={commitTime}
      />

      <div className="grid-row head">
        {headers.map((header) => {
          const sorted = header.column.getIsSorted();
          const className = [
            header.column.id === 'timeline' ? 'tl-head sortable' : 'sortable',
            sorted === false ? '' : 'sorted',
            sorted === 'desc' ? 'desc' : '',
            header.column.id === 'updated' ? 'right' : '',
          ]
            .filter(Boolean)
            .join(' ');
          return (
            <button
              type="button"
              key={header.id}
              className={className}
              onClick={header.column.getToggleSortingHandler()}
            >
              {header.column.id === 'timeline'
                ? ticks.map((tick) => {
                    const x = ((tick - axis.t0) / span) * 100;
                    // 端に貼りつく目盛りは読めないので落とす
                    if (x < 3 || x > 97) return null;
                    return (
                      <span key={tick} className="tick" style={{ left: `${x}%` }}>
                        {formatTick(tick, span)}
                      </span>
                    );
                  })
                : flexRender(header.column.columnDef.header, header.getContext())}
            </button>
          );
        })}
      </div>

      <div id="rows" ref={rowsRef}>
        {/* 時間の格子は全行を貫く 1 枚で敷く。行ごとに描くと行間で点線が途切れる */}
        {rows.length > 0 && tlGeom.width > 0 && (
          <div className="tl-grid" style={{ left: tlGeom.left, width: tlGeom.width }}>
            {ticks.map((tick) => (
              <i key={tick} style={{ left: `${((tick - axis.t0) / span) * 100}%` }} />
            ))}
          </div>
        )}

        {/* 結ぶ線も同じ流儀の 1 枚で、親の帯から子の帯まで 1 本の連続した線として描く
            (行ごとの継ぎだと、継ぎ目の滑らかさが節のような点に見える)。
            帯は行の中心の上下 ±4px を占め、矢印の先はその縁にちょうど触れる。
            線は木の入れ子をなぞるだけの飾りなので、読み上げからは外す */}
        {rows.length > 0 && tlGeom.width > 0 && connections.length > 0 && (
          <svg
            className="tl-conn"
            style={{ left: tlGeom.left, width: tlGeom.width }}
            aria-hidden="true"
          >
            {connections.map((line) => (
              <g key={`${line.parent}-${line.child}`}>
                {line.xs !== null && (
                  <>
                    <line
                      x1={`${line.xs}%`}
                      x2={`${line.xs}%`}
                      y1={midOf(line.parent) + 4}
                      y2={midOf(line.child) - 4}
                      className="net-line"
                    />
                    <svg x={`${line.xs}%`} overflow="visible" aria-hidden="true">
                      <polygon
                        points={`-2.8,${midOf(line.child) - 9} 2.8,${midOf(line.child) - 9} 0,${midOf(line.child) - 4}`}
                        className="net-arrow"
                      />
                    </svg>
                  </>
                )}
                {line.xe !== null && (
                  <>
                    <line
                      x1={`${line.xe}%`}
                      x2={`${line.xe}%`}
                      y1={midOf(line.parent) + 4}
                      y2={midOf(line.child)}
                      className="net-line end"
                    />
                    <svg x={`${line.xe}%`} overflow="visible" aria-hidden="true">
                      <polygon
                        points={`-2.8,${midOf(line.parent) + 9} 2.8,${midOf(line.parent) + 9} 0,${midOf(line.parent) + 4}`}
                        className="net-arrow end"
                      />
                    </svg>
                  </>
                )}
              </g>
            ))}
          </svg>
        )}

        {rows.length === 0 ? (
          <div className="empty">No sessions to show</div>
        ) : (
          rows.map((row, index) => (
            <AgentRowView
              key={row.id}
              row={row}
              last={row.depth === 1 && (index === rows.length - 1 || rows[index + 1]?.depth === 0)}
              selected={selectedFile !== null && selectedFile === row.original.node.file}
              axis={axis}
              nowMs={nowMs}
              onPanStart={onPanStart}
              onOpen={() => {
                // 引き寄せ直後の手離しで会話が開かないようにする
                if (didPanRef.current) {
                  didPanRef.current = false;
                  return;
                }
                nav.openConv(row.original.node.file);
              }}
              onToggle={() => row.toggleExpanded()}
              canExpand={row.getCanExpand()}
              isExpanded={row.getIsExpanded()}
              depth={row.depth}
            />
          ))
        )}
      </div>
    </div>
  );
}

/* 行 1 本。**包みを増やさない** — この `div` が `#rows` の直の子で、親の列を借りている。 */
function AgentRowView({
  row,
  last,
  selected,
  axis,
  nowMs,
  onPanStart,
  onOpen,
  onToggle,
  canExpand,
  isExpanded,
  depth,
}: {
  row: Row<AgentRow>;
  last: boolean;
  selected: boolean;
  axis: Axis;
  nowMs: number;
  onPanStart: (event: React.MouseEvent) => void;
  onOpen: () => void;
  onToggle: () => void;
  canExpand: boolean;
  isExpanded: boolean;
  depth: number;
}) {
  const entry = row.original;
  const node: AgentNode = entry.node;
  const pop = popStyleOf(entry.rid, nowMs);
  const bd = bdOf(entry);
  const worktree = worktreeName(node.cwd);
  const branch = node.git_branch ?? '';
  const awaiting = entry.kind === 'session' ? entry.node.awaiting : null;

  /* いま何をしているか。**待っていることを最優先で見せる。**
     稼働は勝手に進むが、応答待ちはあなたを待っている。 */
  const now =
    awaiting === 'user'
      ? 'awaiting user input'
      : awaiting === 'agents'
        ? 'waiting on subagents'
        : node.state === 'active'
          ? (node.current ?? '')
          : '';

  const issueTokens =
    entry.kind === 'session'
      ? entry.node.issues.slice(0, 2)
      : entry.node.issue !== null
        ? [entry.node.issue]
        : [];

  return (
    // biome-ignore lint/a11y/useSemanticElements: 中に札を持つ行は button にできない
    <div
      className={`grid-row row kind-${entry.kind} state-${node.state}${last ? ' last' : ''}${selected ? ' selected' : ''}${pop === null ? '' : ' pop'}`}
      data-tok={[node.file, ...issueTokens, worktree, branch].filter(Boolean).join(' ')}
      style={pop ?? undefined}
      role="button"
      tabIndex={0}
      aria-label={`Open conversation for ${labelOf(entry)}`}
      {...pressable(() => {
        if (canExpand && selected) onToggle();
        onOpen();
      })}
    >
      <span className="name" style={{ paddingLeft: depth * 24 }}>
        <span className="chev">{canExpand ? (isExpanded ? '▾' : '▸') : ''}</span>
        <Dot state={awaiting === 'user' ? 'input' : node.state} />
        <span className="t">{cut(labelOf(entry), MAX_LABEL_CHARS)}</span>
        {entry.kind === 'session' && <span className="sub-id">{node.id.slice(0, 8)}</span>}
      </span>

      <span>
        <span className={`chip state-${awaiting === 'user' ? 'input' : node.state}`}>
          {awaiting === 'user' ? 'input' : node.state}
        </span>
      </span>

      <span className="col-model" title={node.model ?? ''}>
        {modelShort(node.model)}
      </span>
      <span className="col-eff">{node.effort ?? ''}</span>
      <span
        className="col-tok"
        title="input + output + cache write (transcripts active in the last 7 days only)"
      >
        {node.tokens === null ? '' : formatTokens(node.tokens)}
      </span>

      <span className="col-bd" title={bd}>
        {entry.kind === 'session' && entry.node.actor !== null && (
          <span className="bd-actor">{entry.node.actor}</span>
        )}
        {issueTokens.map((id) => (
          <IssueChip key={id} id={id} />
        ))}
      </span>

      <span className="col-wt" title={worktree}>
        {worktree !== '' && <RefChip name={worktree} kind="worktree" />}
      </span>
      <span className="col-br" title={branch}>
        {branch !== '' && <RefChip name={branch} kind="branch" />}
      </span>

      <span
        className={`col-now${awaiting === 'user' ? ' awaiting' : awaiting === 'agents' ? ' subwait' : ''}`}
        title={now}
      >
        {now}
      </span>
      <span className="col-upd">{formatSinceIso(node.last_activity, nowMs)}</span>

      <TlBar
        node={node}
        axis={axis}
        intervalsComplete={node.intervals_complete}
        nowMs={nowMs}
        onPanStart={onPanStart}
      />
    </div>
  );
}
