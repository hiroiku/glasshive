import { mdiCalendarBlankOutline, mdiFlagOutline, mdiSourceBranch } from '@mdi/js';
import { useMemo } from 'react';
import type { IssueSummaryJson } from '~/interface/presenters/issues/issues.presenter.ts';
import type { ProjectJson } from '~/interface/presenters/sessions/tree.presenter.ts';
import { buildMilestones, type MilestoneRow } from '../../derive/milestones.ts';
import { viaLabel, type WorkerIndex } from '../../derive/workers.ts';
import type { WorkJoin } from '../../derive/workJoin.ts';
import { absTime, cut, formatDue } from '../../format.ts';
import { useNav } from '../../nav/NavContext.tsx';
import { pressable } from '../../pressable.ts';
import { AgentChip } from '../chips/Chips.tsx';
import { Icon } from '../primitives/Icon.tsx';
import { SubjectText } from '../text/SubjectText.tsx';

/* マイルストーンの一覧。**課題とブランチと並ぶ 3 つ目の単位である。**

   行を押すと、その区切りの課題だけに絞った一覧へ移る。ブランチの名前を押せばそのブランチへ、
   エージェントのチップを押せばその会話へ移る —— 3 つの単位のどこからでも、他の 2 つへ辿れる。

   期日の近い順に並ぶ。件数の多い順ではない —— 読みたいのは「次に来る区切りに間に合うのか」で、
   その問いに答えるのは残りの件数と、いま誰が触っているかである。 */

/** 1 行に並べるブランチの数 */
const MAX_LISTED_BRANCHES = 3;

/** 1 行に並べるエージェントのチップの数 */
const MAX_LISTED_WORKERS = 3;

/** これより先の期日は「遠い先」として色を変えない。近いものだけを目立たせる */
const SOON_MS = 7 * 86_400_000;

export interface MilestonesProps {
  readonly issues: readonly IssueSummaryJson[];
  readonly workers: WorkerIndex;
  readonly join: WorkJoin | undefined;
  readonly project: ProjectJson | undefined;
  /** ツールバー。単位の切り替えを含めて、呼ぶ側が組む */
  readonly lead: React.ReactNode;
  readonly query: string;
  readonly nowMs: number;
}

export function Milestones({
  issues,
  workers,
  join,
  project,
  lead,
  query,
  nowMs,
}: MilestonesProps) {
  const rows = useMemo(() => buildMilestones(issues, join, workers), [issues, join, workers]);

  const needle = query.trim().toLowerCase();
  const shown =
    needle === '' ? rows : rows.filter((row) => (row.title ?? '').toLowerCase().includes(needle));

  return (
    <>
      {lead}
      {shown.length === 0 ? (
        <p className="empty">
          {rows.length === 0
            ? 'No milestones on the issues fetched from GitHub'
            : `No matching milestones (0 of ${rows.length})`}
        </p>
      ) : (
        <div id="ms-list">
          <div className="ms-row head">
            <span>Milestone</span>
            <span>Due</span>
            <span>Progress</span>
            <span className="right">Open</span>
            <span className="right">Blocked</span>
            <span>Branches</span>
            <span>Agents</span>
          </div>
          {shown.map((row) => (
            <MilestoneLine key={row.title ?? ''} row={row} project={project} nowMs={nowMs} />
          ))}
        </div>
      )}

      {/* 凡例は画面の下。3 つの単位で同じ決まりにしてある */}
      <div className="legend-bar">
        <span>
          <Icon path={mdiCalendarBlankOutline} size={11} /> due date from GitHub
        </span>
        <span>
          <b className="ms-due soon">due</b> within a week, or already past
        </span>
        <span>
          <i className="lg-prog" /> issues closed out of the whole milestone
        </span>
        <span>
          <b className="msbr">
            <Icon path={mdiSourceBranch} size={9} />
          </b>{' '}
          a branch that is alive here and carries one of these issues
        </span>
        <span>press a named row to see just that milestone in the issue list</span>
      </div>
    </>
  );
}

function MilestoneLine({
  row,
  project,
  nowMs,
}: {
  row: MilestoneRow;
  project: ProjectJson | undefined;
  nowMs: number;
}) {
  const nav = useNav();
  const dueMs = row.dueOn === null ? null : Date.parse(row.dueOn);
  const soon = dueMs !== null && Number.isFinite(dueMs) && dueMs - nowMs < SOON_MS;
  const done = row.total === 0 ? 0 : row.closed / row.total;

  /* 押しどころとして出すのは、行ける先を持つ行だけである。役もフォーカスの順も名前も
     まとめてここで決める —— 3 つのうち 1 つだけが残ると、辿れるのに動かない行になる。 */
  const title = row.title;
  const press =
    title === null
      ? {}
      : {
          role: 'button' as const,
          tabIndex: 0,
          'aria-label': `Show issues in ${title}`,
          ...pressable(() => nav.gotoMilestone(title)),
        };

  return (
    /* マイルストーンの付いていない束は、押しても行き先が無い。**押しどころとして出さない**
       —— `ms` はマイルストーンの名前で絞る仕組みで、「付いていない」を表す綴りを持たない。
       名前として通せる綴りはどれも実在の名前と衝突しうるので、行ける先が無いことを
       そのまま出す。 */
    // biome-ignore lint/a11y/useSemanticElements: 中にチップを持つ行は button にできない
    <div className={`ms-row${title === null ? ' none' : ''}`} {...press}>
      <span className="ms-name">
        <Icon path={mdiFlagOutline} size={11} />
        {/* 名前が無いことを名前で表さない。付いていない課題の束であることをそのまま言う */}
        {title === null ? (
          <em>no milestone</em>
        ) : (
          <span className="ms-title">
            <SubjectText text={title} project={project} />
          </span>
        )}
      </span>

      <span className={`ms-due${soon ? ' soon' : ''}`}>
        {row.dueOn === null ? (
          <span className="dimtxt">—</span>
        ) : (
          <span title={absTime(row.dueOn)}>{formatDue(row.dueOn, nowMs)}</span>
        )}
      </span>

      <span className="epic-prog" title={`${row.closed}/${row.total} closed`}>
        <span className="epic-bar">
          <i style={{ width: `${done * 100}%` }} />
        </span>
        <b>
          {row.closed}/{row.total}
        </b>
      </span>

      <span className="right mono">{row.open || ''}</span>
      <span className={`right mono${row.blocked > 0 ? ' warn' : ''}`}>{row.blocked || ''}</span>

      <span className="ms-branches">
        {row.branches.slice(0, MAX_LISTED_BRANCHES).map((branch) => (
          <button
            key={branch}
            type="button"
            className="msbr"
            title={`Open branch ${branch}`}
            {...pressable(() => nav.openRef(branch, branch), { stopPropagation: true })}
          >
            <Icon path={mdiSourceBranch} size={9} />
            <span>{cut(branch, 20)}</span>
          </button>
        ))}
        {row.branches.length > MAX_LISTED_BRANCHES && (
          <span className="g-more">+{row.branches.length - MAX_LISTED_BRANCHES}</span>
        )}
      </span>

      <span className="ms-workers">
        {row.workers.slice(0, MAX_LISTED_WORKERS).map((worker) => (
          <AgentChip
            key={worker.file}
            file={worker.file}
            state={worker.state}
            label={worker.label}
            where={worker.where}
            via={viaLabel(worker)}
          />
        ))}
        {row.workers.length > MAX_LISTED_WORKERS && (
          <span className="g-more">+{row.workers.length - MAX_LISTED_WORKERS}</span>
        )}
      </span>
    </div>
  );
}
