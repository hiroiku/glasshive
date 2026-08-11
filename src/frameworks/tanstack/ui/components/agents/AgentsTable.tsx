/* biome-ignore-all lint/a11y/useSemanticElements: subgrid で列を揃えるので table の要素を置けない */
/* biome-ignore-all lint/a11y/useFocusableInteractive: セルは行ごと辿る。1 つずつのタブ順は作らない */

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
import { messagesQuery } from '../../../queries/messages.query.ts';
import {
  agentTypeShort,
  cut,
  formatSinceIso,
  formatTokens,
  modelShort,
  worktreeName,
} from '../../format.ts';
import { useDeepSearch } from '../../hooks/useDeepSearch.ts';
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
import { RefChip } from '../chips/Chips.tsx';
import { Dot } from '../primitives/Dot.tsx';
import { TlBar } from '../timeline/TlBar.tsx';
import { AgentsToolbar } from './AgentsToolbar.tsx';

/* エージェントの表。11 本の列と、親子を結ぶ線と、掴んで時間帯を動かす操作。

   列の定義・入れ子のグリッド・結ぶ線・掴んで動かす操作は、行の高さ(`rowPitch`)と
   時間の列の位置(`tlGeom`)と軸(`axis`)で強く結び合っている。**このファイルを分割しない**
   — その 3 つをコンポーネントの間で受け渡すことになり、どこで測ってどこで使うのかが読めなくなる。

   `#tree-pane` の直の子にラッパー要素を挟まない。列を決めているのは `#tree-pane` で、
   行は `subgrid` で親の列に乗っている。1 枚挟むと列が揃わなくなる。

   `#tree-pane` は `role="grid"` なので、直の子は `row` か `rowgroup` だけにする。列を
   持たないもの — ツールバーと、行を開く操作の説明 — は `#tree-pane` の外へ置く。 */

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
      readonly subs: AgentRow[];
    };

/* 平らに届いたサブエージェントを、親の下へ入れ子にする。

   **字下げだけを深くしても木にはならない。** 親を畳んだのに孫が残っていれば、
   ユーザーには親の居ない行が並んでいるようにしか見えない。畳んだときに孫まで届くのは、
   表そのものが入れ子構造を持っているときだけである。

   置くのは既に置いた親の下だけにする。親がまだ現れていない子は根へ倒れるので、
   `*.meta.json` の親子関係が循環していても、入れ子は循環しない。

   親が絞り込みで消えた子も根へ出す。木から外すと、ユーザーには
   「そんな子は動いていない」としか見えない。 */
function nestSubagents(subagents: readonly SubagentJson[]): AgentRow[] {
  const placed = new Map<string, AgentRow>();
  const roots: AgentRow[] = [];

  for (const subagent of subagents) {
    const row: AgentRow = {
      rid: `a:${subagent.file}`,
      kind: 'subagent',
      node: subagent,
      subs: [],
    };
    placed.set(subagent.id, row);
    const parent = subagent.parent === null ? undefined : placed.get(subagent.parent);
    if (parent === undefined) roots.push(row);
    else parent.subs.push(row);
  }

  return roots;
}

/** 並べ替えに使う状態の順。動いているものが先 */
const STATE_ORDER: Record<string, number> = { active: 0, waiting: 1, ended: 2 };

const EFFORT_ORDER: Record<string, number> = {
  low: 0,
  medium: 1,
  high: 2,
  xhigh: 3,
  max: 4,
};

/** 表に出す名前(ラベル)の最大長 */
const MAX_LABEL_CHARS = 60;

/** これだけ動きが無い待機は「要注意」として拾う */
const STALE_WAIT_MS = 30 * 60_000;

/** 1 つの親から引く線の上限。これを超えると線が束になって読めない */
const MAX_CONNECTIONS_PER_PARENT = 12;

/* 1 枚に引ける矢印の上限。**これを超えたら本数だけを出して、描くのをやめる。**
   重なりすぎた矢印は誰が誰へ送ったのかを語らない — ただの網目になる。 */
const MAX_MESSAGE_ARROWS = 300;

/** 同じ相手どうしのメッセージを 1 本にまとめる横幅。これより近ければ目には重なって見える */
const MARK_MERGE_PX = 4;

const labelOf = (row: AgentRow): string =>
  row.kind === 'session' ? (row.node.title ?? row.node.id.slice(0, 8)) : row.node.label;

/* 何に取り組んでいるかの短い表示。チップにする前の、並べ替えのための素の文字列 */
const workingOn = (row: AgentRow): string =>
  row.kind === 'subagent' ? (row.node.issue ?? '') : row.node.issues.slice(0, 2).join(' ');

/** 稼働区間のバーの上に描く矢印 1 本。近すぎるやりとりは 1 本にまとめてある */
interface TalkArrow {
  readonly key: string;
  /** 送り手の行 */
  readonly from: number;
  /** 受け手の行 */
  readonly to: number;
  readonly x: number;
  readonly who: string;
  readonly summary: string;
  /** 送信側の `transcript`。押すと、そのメッセージが在る会話へ */
  readonly file: string | null;
  /** まとめた中身の数 */
  readonly count: number;
  readonly label: string;
}

/* 1 つのセッションのやりとり。**`readable` を最初に読む。** 観測できなかった回も
   0 本で返るので、数だけを見ると「一度も話さなかった」と読める。 */
interface TalkHops {
  readonly drawn: readonly TalkArrow[];
  /** 矢印が語っているメッセージの数 */
  readonly shown: number;
  /** 描けなかったメッセージの数 */
  readonly dropped: number;
  /** 読み取り範囲が `transcript` の先頭まで届いたか */
  readonly complete: boolean;
  readonly readable: boolean;
}

/** 行を開く操作の説明を指す id。全部の行が同じ 1 つを指す */
const OPEN_HINT_ID = 'agents-open-hint';

/* この表が持つ列の `id`。**並べ替えの名前はこの一覧の中にしか無い。**

   URL の `sort` はここに在るものだけを通す。通さないと TanStack が知らない列を黙って捨て、
   既定の並びごと落ちる。列の綴りをここへ結んでおけば、列の名前を変えたときに
   型検査が落ちる。 */
export const AGENT_COLUMN_IDS = [
  'name',
  'state',
  'model',
  'effort',
  'tokens',
  'work',
  'worktree',
  'branch',
  'now',
  'updated',
  'timeline',
] as const;

/** 列の定義。`id` は `AGENT_COLUMN_IDS` に在る名前しか置けない */
type AgentColumn = ColumnDef<AgentRow> & { readonly id: (typeof AGENT_COLUMN_IDS)[number] };

/** 消費の列に添える、何を数えているかの断り */
const TOKENS_NOTE = 'input + output + cache write (transcripts active in the last 7 days only)';

/** 見えている欄への部分一致(大文字小文字を問わない) */
const hits = (query: string, haystack: readonly (string | null | undefined)[]): boolean =>
  haystack.some((value) => value?.toLowerCase().includes(query) === true);

export interface AgentsTableProps {
  readonly project: ProjectJson;
  readonly showAll: boolean;
  readonly nowMs: number;
  /** いま会話パネルに出ている `transcript`。行をハイライトするためだけに使う */
  readonly selectedFile: string | null;
  /** このプロジェクトを初めて描くか。初回は変化のハイライトを出さない */
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
  /* エージェント間メッセージは URL の検索パラメータに載せない。**メッセージは
     `transcript` のどこにでも現れる**ので、拾うにはセッションの `transcript` を
     サブエージェントごと丸ごと読むしかない。ブックマークを開いただけでは走らせない。 */
  const [talk, setTalk] = useState(false);
  const [scale, setScale] = useState<Scale>('auto');
  // 手で選んだ絶対の時間帯。null なら Auto か決め打ちの幅(右端 = 最新)に従う
  const [picked, setPicked] = useState<Axis | null>(null);

  const trimmed = query.trim().toLowerCase();
  /* 中身の検索は常に走る。見出しの一致はその場で出て、
     中身の一致は読み進むにつれて**足されていく**。 */
  const deep = useDeepSearch(project.id, trimmed);
  const deepFiles = deep.files;

  /* 結ぶ線を行の境目まで正しく届かせるための行の実際の高さと、
     全行を貫く時間のグリッドを敷くための、時間列の位置と幅を測る。 */
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

      if (trimmed !== '') {
        /* 見出しの一致と中身の一致を足し合わせる。**片方をもう片方で置き換えない** —
           中身を読み終える前に置き換えると、見えている欄で当たっていた行が一度消える。 */
        const own =
          deepFiles.has(session.file) ||
          hits(trimmed, [
            session.title,
            session.id,
            session.git_branch,
            session.current,
            worktreeName(session.cwd),
            ...session.issues,
          ]);
        if (!own) {
          // 親が当たらなくても、当たった子は親ごと残す
          subs = subs.filter(
            (subagent) =>
              deepFiles.has(subagent.file) ||
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
        subs: nestSubagents(subs),
      });
    }
    return rows;
  }, [project, showAll, nowMs, attention, trimmed, deepFiles]);

  /* 変わった行を拾うのは、**絞り込みで見えていない行も含めて**である。
     見えている行だけを見比べると、絞り込みを切り替えただけで全部が「変わった」ことになる。 */
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

  const columns = useMemo<AgentColumn[]>(
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
      { id: 'work', header: 'Working on', accessorFn: workingOn },
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
    getSubRows: (row) => (row.subs.length > 0 ? row.subs : undefined),
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getExpandedRowModel: getExpandedRowModel(),
    enableSortingRemoval: false,
  });

  const rows = table.getRowModel().rows;

  /* バーの長さを決める分母。**いま出ている行の合計である。** 出ている行のバーを足すと
     100% になり、絞り込みや開き閉じで出ている行が変われば分母も変わる。

     セッションとサブエージェントの消費はそれぞれ自分の `transcript` からだけ数えているので、
     親と子を一緒に足しても二重にはならない。

     全部 0 のときに 0 で割らないよう 1 で下支えする。 */
  const tokenTotal = useMemo(
    () =>
      Math.max(
        1,
        rows.reduce((sum, row) => sum + (row.original.node.tokens ?? 0), 0),
      ),
    [rows],
  );

  const nodes = useMemo<TimelineNode[]>(() => rows.map((row) => row.original.node), [rows]);
  const autoAxis = useMemo(() => axisOf(nodes, scale, nowMs), [nodes, scale, nowMs]);
  const axis = picked ?? autoAxis;
  const span = axis.t1 - axis.t0;
  const ticks = useMemo(() => niceTicks(axis.t0, axis.t1), [axis.t0, axis.t1]);
  /* 見出しに置く目盛り。端に貼りつくものは読めないので落とす。**残った両端の寄せ方を
     変える。** 中央寄せのまま置くと、左端のラベルは列からはみ出して並べ替えの ▲ と
     隣の列に被り、右端のラベルは列の外へ出る。

     位置は `left` ではなく `--tick-x` で渡す。**インラインの宣言は `!important` の無い
     規則に必ず勝つ**ので、`left` を直に置くと、並べ替えの ▲ を避ける CSS 側の底上げが
     一度も効かない。 */
  const shownTicks = useMemo(
    () =>
      ticks
        .map((at) => ({ at, x: ((at - axis.t0) / span) * 100 }))
        .filter((tick) => tick.x >= 3 && tick.x <= 97),
    [ticks, axis.t0, span],
  );
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

  /* 稼働区間のバーの上を掴んで時間帯を動かす。動かすのは表示範囲だけで、
     スライダーも目盛りも時刻のラベルも同じ軸を読んでいるので、勝手に揃う。 */
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
      // 単なるクリックは行を開く操作のまま。動かす意図があったときだけ、掴んで動かす操作に変える
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

  /* 親から子へ結ぶ線。行きは親の稼働区間から子の稼働区間の始まりへ、帰りは子の終わりから親へ。
     向きは矢印が担う。**表示範囲の外へ出た縦線は端へ吸着させず、そのまま描かない。** */
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
      if (row.depth === 0) return;
      // 親は、自分より浅い深さで最も近い上の行である
      let parent = index - 1;
      while (parent >= 0 && (rows[parent]?.depth ?? 0) >= row.depth) parent -= 1;
      if (parent < 0) return;
      const drawn = (perParent.get(parent) ?? 0) + 1;
      perParent.set(parent, drawn);
      // 広がりすぎた木では線を引くのを諦める。読めない線は情報ではない
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

  /* エージェント間メッセージは 1 つのセッションぶんだけ引く。**読むのは `transcript` の
     丸ごとである。** いま選んでいる行のセッションに絞り、選んでいなければ一番上に
     出ているものにする。 */
  const focusSessionId = useMemo(() => {
    if (!talk) return '';
    const owns = (session: SessionJson) =>
      session.file === selectedFile ||
      session.subagents.some((subagent) => subagent.file === selectedFile);
    const chosen = project.sessions.find(owns);
    if (chosen !== undefined) return chosen.id;
    return rows.find((row: Row<AgentRow>) => row.depth === 0)?.original.node.id ?? '';
  }, [talk, selectedFile, project.sessions, rows]);

  const talkQuery = useQuery({
    ...messagesQuery(project.id, focusSessionId),
    enabled: talk && focusSessionId !== '',
  });

  /* 誰が誰へメッセージを送ったかを、行と時間の座標に落とす。

     **畳まれた相手へのメッセージは、見えている親へ束ねる。** 描かないと、木を畳んだ
     途端にやりとりが無かったことになる。表示範囲の外へ出たメッセージは稼働区間と同じく
     描かない — 端へ吸着させると、そこで起きたことのように見える。 */
  const talkHops = useMemo<TalkHops | null>(() => {
    const answer = talkQuery.data;
    if (!talk || answer === undefined || answer === null) return null;
    /* 観測できなかった回を 0 本として返さない。**presenter は `absent` でも
       `unobservable` でも `hops` を空で返す。** 空をそのまま数えると、走査に失敗した
       セッションが「一度も話さなかった」ことになる。 */
    if (!answer.ok || answer.body.state !== 'observed') {
      return { drawn: [], shown: 0, dropped: 0, complete: false, readable: false };
    }

    const visible = new Map<string, number>();
    const named = new Map<string, { readonly label: string; readonly file: string }>();
    rows.forEach((row: Row<AgentRow>, index: number) => {
      const node = row.original.node;
      visible.set(node.id, index);
      named.set(node.id, { label: labelOf(row.original), file: node.file });
    });
    const parents = new Map<string, string>();
    const walk = (branch: readonly AgentRow[], parent: string | null) => {
      for (const entry of branch) {
        if (parent !== null) parents.set(entry.node.id, parent);
        walk(entry.subs, entry.node.id);
      }
    };
    walk(data, null);

    const seat = (id: string): number | null => {
      let at: string | undefined = id;
      while (at !== undefined) {
        const found = visible.get(at);
        if (found !== undefined) return found;
        at = parents.get(at);
      }
      return null;
    };

    /* 同じ相手どうしが、目に見えない近さで交わしたメッセージは 1 本にまとめる。

       **重ねても濃くなるだけで、本数は読めない。** やりとりの多い組み合わせでは 5 時間に
       数百通が集まり、7 日の幅で見ればそれが数十 px に潰れる。1 本にまとめて件数を
       添えれば、同じ場所が「何度も話した」と読める。 */
    const pitch = Math.max(tlGeom.width, 1) / MARK_MERGE_PX;
    const marks = new Map<
      string,
      {
        readonly key: string;
        readonly from: number;
        readonly to: number;
        readonly x: number;
        readonly who: string;
        readonly summary: string;
        /** 送信側の `transcript`。押すと、そのメッセージが在る会話へ */
        readonly file: string | null;
        count: number;
      }
    >();
    let dropped = 0;
    for (const hop of answer.body.hops) {
      const atMs = Date.parse(hop.at);
      const x = ((atMs - axis.t0) / span) * 100;
      const from = seat(hop.from);
      const to = seat(hop.to);
      if (!Number.isFinite(x) || x < 0 || x > 99.8 || from === null || to === null || from === to) {
        dropped += 1;
        continue;
      }
      const at = `${from}:${to}:${Math.round((x / 100) * pitch)}`;
      const found = marks.get(at);
      if (found !== undefined) {
        found.count += 1;
        continue;
      }
      if (marks.size >= MAX_MESSAGE_ARROWS) {
        dropped += 1;
        continue;
      }
      marks.set(at, {
        key: hop.tool_use,
        from,
        to,
        x,
        who: `${named.get(hop.from)?.label ?? hop.from} → ${named.get(hop.to)?.label ?? hop.to}`,
        summary: hop.summary,
        file: named.get(hop.from)?.file ?? null,
        count: 1,
      });
    }

    const drawn = [...marks.values()].map((mark) => ({
      ...mark,
      label: [mark.who, mark.count > 1 ? `${mark.count} messages` : '', mark.summary]
        .filter((part) => part !== '')
        .join(' · '),
    }));
    return {
      drawn,
      // 矢印が語っているメッセージの数。まとめた本数ではなく、まとめられた中身の数で言う
      shown: drawn.reduce((count, mark) => count + mark.count, 0),
      dropped: dropped + answer.body.unplaced,
      complete: answer.body.complete,
      readable: true,
    };
  }, [talk, talkQuery.data, rows, data, axis, span, tlGeom.width]);

  return (
    <>
      {/* 行を開く操作の説明。全部の行が指す 1 つで足りるので、行の中には置かない —
          置くと 11 本の `subgrid` に 12 個目のセルが増える。`grid` の子は `row` か
          `rowgroup` だけなので、`#tree-pane` の外に置く */}
      <span id={OPEN_HINT_ID} className="vhidden">
        Press Enter to open the conversation
      </span>
      <AgentsToolbar
        query={query}
        onQuery={onQuery}
        /* 読み切ったら消す。読み切る前に止まったときは残す — 残っている数が、
           まだ全部を見ていないことを言う。**読めずに止まった回も残す** —
           1 回目で止まると `scanned` も `total` も 0 のままなので、数では言えない */
        deepNote={
          deep.running || deep.unreadable || (deep.total > 0 && deep.scanned < deep.total)
            ? { scanned: deep.scanned, total: deep.total, unreadable: deep.unreadable }
            : null
        }
        talk={talk}
        onTalk={setTalk}
        talkNote={
          talkHops === null
            ? null
            : {
                readable: talkHops.readable,
                messages: talkHops.shown,
                marks: talkHops.drawn.length,
                dropped: talkHops.dropped,
                complete: talkHops.complete,
              }
        }
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

      {/* 表そのものが `grid` である。**行を `button` にすると中身が消える。** `button` は
          中の要素を読み上げから外す役なので、状態もモデルも消費もブランチも、行の名前 1 つに
          置き換わってしまう。 */}
      <div id="tree-pane" role="grid" aria-label="Sessions and subagents">
        <div className="grid-row head" role="row">
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
              /* 見出しは `columnheader` である。**`button` には置き換えられない** —
                 役が `button` だと、この列がいまどう並んでいるかを言う `aria-sort` を
                 置く先が無くなる。押しどころとしての振る舞いは `pressable` が持つ。 */
              <div
                key={header.id}
                className={className}
                role="columnheader"
                tabIndex={0}
                aria-sort={
                  sorted === false ? 'none' : sorted === 'desc' ? 'descending' : 'ascending'
                }
                {...pressable(() => header.column.toggleSorting())}
              >
                {header.column.id === 'timeline'
                  ? shownTicks.map((tick, index) => (
                      <span
                        key={tick.at}
                        /* 1 本しか残らないときは左端の寄せだけを当てる。両方当てると
                           `.last` が後勝ちして、真ん中の目盛りが左へ引っ張られる */
                        className={[
                          'tick',
                          index === 0 ? 'first' : '',
                          index > 0 && index === shownTicks.length - 1 ? 'last' : '',
                        ]
                          .filter(Boolean)
                          .join(' ')}
                        style={{ '--tick-x': `${tick.x}%` } as React.CSSProperties}
                      >
                        {formatTick(tick.at, span)}
                      </span>
                    ))
                  : flexRender(header.column.columnDef.header, header.getContext())}
              </div>
            );
          })}
        </div>

        <div id="rows" ref={rowsRef} role="rowgroup">
          {/* 時間のグリッドは全行を貫く 1 枚で敷く。行ごとに描くと行間で点線が途切れる */}
          {rows.length > 0 && tlGeom.width > 0 && (
            <div
              className="tl-grid"
              style={{ left: tlGeom.left, width: tlGeom.width }}
              aria-hidden="true"
            >
              {ticks.map((tick) => (
                <i key={tick} style={{ left: `${((tick - axis.t0) / span) * 100}%` }} />
              ))}
            </div>
          )}

          {/* 結ぶ線も同じく全行を貫く 1 枚で、親のバーから子のバーまで 1 本の連続した線として
              描く(行ごとに継ぐと、継ぎ目が節のような点に見える)。
              バーは行の中心の上下 ±4px を占め、矢印の先はその縁にちょうど触れる。
              この線は木の入れ子をなぞるだけの飾りなので、読み上げからは外す */}
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

          {/* エージェント間メッセージの矢印。**親子ではなく、実際にやりとりした相手どうしを結ぶ。**
              親子の線と同じ座標に乗るので描き方も揃えるが、色を分けて別の意味だと分かるようにする。
              細い線はクリックしにくいので、透明な太い線を重ねて当たり判定を広げる */}
          {rows.length > 0 &&
            tlGeom.width > 0 &&
            talkHops !== null &&
            talkHops.drawn.length > 0 && (
              /* 重ねる面そのものは役から外す。`#rows` は `rowgroup` で、持てるのは `row`
                 だけである。矢 1 本 1 本は押しどころなので、そちらの役は残す */
              <svg
                className="tl-msg"
                role="presentation"
                style={{ left: tlGeom.left, width: tlGeom.width }}
              >
                <title>Messages between agents</title>
                {talkHops.drawn.map((arrow) => {
                  const down = arrow.to > arrow.from;
                  const y1 = midOf(arrow.from) + (down ? 4 : -4);
                  const y2 = midOf(arrow.to) + (down ? -5 : 5);
                  const tip = midOf(arrow.to) + (down ? -9 : 9);
                  return (
                    /* svg の中に button は置けないので、押しどころの役だけをここで名乗る */
                    <g
                      key={arrow.key}
                      className="msg"
                      role="button"
                      tabIndex={0}
                      aria-label={arrow.label}
                      {...pressable(() => {
                        if (arrow.file !== null) nav.openConv(arrow.file);
                      })}
                    >
                      <title>{arrow.label}</title>
                      <line
                        x1={`${arrow.x}%`}
                        x2={`${arrow.x}%`}
                        y1={y1}
                        y2={y2}
                        className="msg-hit"
                      />
                      <line
                        x1={`${arrow.x}%`}
                        x2={`${arrow.x}%`}
                        y1={y1}
                        y2={y2}
                        className="msg-line"
                      />
                      <svg x={`${arrow.x}%`} overflow="visible" aria-hidden="true">
                        <polygon points={`-2.8,${tip} 2.8,${tip} 0,${y2}`} className="msg-arrow" />
                      </svg>
                    </g>
                  );
                })}
              </svg>
            )}

          {rows.length === 0 ? (
            <div className="empty" role="row">
              <span role="gridcell">No sessions to show</span>
            </div>
          ) : (
            rows.map((row, index) => (
              <AgentRowView
                key={row.id}
                row={row}
                /* 縦線を半分で止めるのは、同じ線を継ぐ行がもう下に無いときだけ。
                   次の行が浅くなったら、そこから先は別の親から下りる別の線である */
                last={
                  row.depth > 0 &&
                  (index === rows.length - 1 || (rows[index + 1]?.depth ?? 0) < row.depth)
                }
                selected={selectedFile !== null && selectedFile === row.original.node.file}
                axis={axis}
                nowMs={nowMs}
                tokenTotal={tokenTotal}
                onPanStart={onPanStart}
                onOpen={() => {
                  // 掴んで動かした直後のマウスアップで会話が開かないようにする
                  if (didPanRef.current) {
                    didPanRef.current = false;
                    return;
                  }
                  nav.openConv(row.original.node.file);
                }}
                onToggle={() => row.toggleExpanded()}
                canExpand={row.getCanExpand()}
                isExpanded={row.getIsExpanded()}
                /* 字下げはサブエージェント自身が持つ `depth` で取る。表の入れ子の深さだと、
                   親が絞り込みで消えた孫が、直に呼ばれた子と同じ深さに見えてしまう */
                depth={row.original.kind === 'session' ? 0 : row.original.node.depth}
              />
            ))
          )}
        </div>
      </div>
    </>
  );
}

/* 行 1 本。**ラッパー要素を増やさない** — この `div` が `#rows` の直の子で、`subgrid` で
   親の列に乗っている。 */
function AgentRowView({
  row,
  last,
  selected,
  axis,
  nowMs,
  tokenTotal,
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
  /** バーの長さを決める分母。いま出ている行の消費の合計 */
  tokenTotal: number;
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
  const working = workingOn(entry);
  const worktree = worktreeName(node.cwd);
  const branch = node.git_branch ?? '';
  const awaiting = entry.kind === 'session' ? entry.node.awaiting : null;
  /** `agent_type`。短縮した表記を出し、元の値はホバーしたときに `title` で見せる */
  const calledAs = entry.kind === 'subagent' ? entry.node.agent_type : null;

  /* いま何をしているか。**待っていることを最優先で見せる。**
     稼働中の作業は勝手に進むが、入力待ちはユーザーが動くまで進まない。 */
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

  /* 消費を読めなかった行。**0 と同じ空欄にしない。** 空欄は「使っていない」と読める */
  const unreadTokens = node.tokens_state === 'unobservable';

  return (
    /* 行は `row` である。**`button` にすると中身が全部消える。** `button` は中の要素を
       読み上げから外す役なので、11 個のセルが「Open conversation for …」1 文に置き換わり、
       中のチップも押しどころとして不正になる。開く操作は `aria-describedby` の指す説明で言う。 */
    <div
      className={`grid-row row kind-${entry.kind} state-${node.state}${last ? ' last' : ''}${selected ? ' selected' : ''}${pop === null ? '' : ' pop'}`}
      data-tok={[node.file, ...issueTokens, worktree, branch].filter(Boolean).join(' ')}
      /* 深さは罫線を引く CSS にも渡す。字下げだけを動かすと、線だけが深さ 0 の位置に残る */
      style={{ ...pop, '--depth': String(depth) } as React.CSSProperties}
      role="row"
      tabIndex={0}
      aria-selected={selected}
      aria-expanded={canExpand ? isExpanded : undefined}
      aria-describedby={OPEN_HINT_ID}
      {...pressable(() => {
        if (canExpand && selected) onToggle();
        onOpen();
      })}
    >
      <span className="name" role="gridcell" style={{ paddingLeft: depth * 24 }}>
        <span className="chev">{canExpand ? (isExpanded ? '▾' : '▸') : ''}</span>
        <Dot state={awaiting === 'user' ? 'input' : node.state} />
        <span className="t">{cut(labelOf(entry), MAX_LABEL_CHARS)}</span>
        {entry.kind === 'session' && <span className="sub-id">{node.id.slice(0, 8)}</span>}
        {/* ラベルが 16 進の id しか無い子では、何をしている子かはこれでしか読めない。
            列は増やさない — 11 本の `subgrid` を崩すと表全体の列が揃わなくなる */}
        {agentTypeShort(calledAs) !== '' && (
          <span className="sub-id" title={calledAs ?? ''}>
            {agentTypeShort(calledAs)}
          </span>
        )}
      </span>

      <span role="gridcell">
        <span className={`chip state-${awaiting === 'user' ? 'input' : node.state}`}>
          {awaiting === 'user' ? 'input' : node.state}
        </span>
      </span>

      <span className="col-model" role="gridcell" title={node.model ?? ''}>
        {modelShort(node.model)}
      </span>
      <span className="col-eff" role="gridcell">
        {node.effort ?? ''}
      </span>
      {/* バーは、いま出ている行の合計に対する割合である。足すと 100% になる。
          **読めなかった消費を空欄にしない。** 空欄は 0 と並んで見えるので、
          読めなかったほうは `?` で読めなかったと言う */}
      <span
        className="col-tok"
        role="gridcell"
        title={
          unreadTokens
            ? `Could not be read. ${TOKENS_NOTE}`
            : node.tokens === null
              ? TOKENS_NOTE
              : `${formatTokens(node.tokens)} — ${Math.round((node.tokens / tokenTotal) * 100)}% of the ${formatTokens(tokenTotal)} shown. ${TOKENS_NOTE}`
        }
      >
        <span className="mono">
          {unreadTokens ? '?' : node.tokens === null ? '' : formatTokens(node.tokens)}
        </span>
        <span className="tok-bar">
          {!unreadTokens && node.tokens !== null && node.tokens > 0 && (
            <i style={{ width: `${(node.tokens / tokenTotal) * 100}%` }} />
          )}
        </span>
      </span>

      {/* `.worktrees/<名前>` から拾った名前である。**課題のチップにしない** —
          GitHub の課題の id は `#101` の形なので、押しても開く先が無い */}
      <span className="col-work" role="gridcell" title={working}>
        {issueTokens.map((id) => (
          <span key={id} className="wtname">
            {id}
          </span>
        ))}
      </span>

      <span className="col-wt" role="gridcell" title={worktree}>
        {worktree !== '' && <RefChip name={worktree} kind="worktree" />}
      </span>
      <span className="col-br" role="gridcell" title={branch}>
        {branch !== '' && <RefChip name={branch} kind="branch" />}
      </span>

      <span
        className={`col-now${awaiting === 'user' ? ' awaiting' : awaiting === 'agents' ? ' subwait' : ''}`}
        role="gridcell"
        title={now}
      >
        {now}
      </span>
      <span className="col-upd" role="gridcell">
        {formatSinceIso(node.last_activity, nowMs)}
      </span>

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
