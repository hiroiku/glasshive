import { mdiCalendarBlankOutline, mdiFlagOutline, mdiSourceBranch } from '@mdi/js';
import { useMemo } from 'react';
import type { Translator } from '~/interface/i18n/translator.ts';
import type { IssueSummaryJson } from '~/interface/presenters/issues/issues.presenter.ts';
import type { ProjectJson } from '~/interface/presenters/sessions/tree.presenter.ts';
import type { GroupTrack, RowTrack } from '../../derive/issueEvents.ts';
import {
  type EventLog,
  groupTrack,
  openMarkOf,
  trackEndsOf,
  trackLineOf,
} from '../../derive/issueEvents.ts';
import {
  atPct,
  formatGanttTick,
  type GanttAxis,
  type GanttWindow,
  ganttAxis,
  ganttGridImage,
  ganttGuides,
  ganttTicks,
} from '../../derive/issueGantt.ts';
import { buildMilestones, type MilestoneRow } from '../../derive/milestones.ts';
import { viaLabel, type WorkerIndex } from '../../derive/workers.ts';
import type { WorkJoin } from '../../derive/workJoin.ts';
import { absTime, cut, formatDue } from '../../format.ts';
import { useT } from '../../i18n/useT.ts';
import { useNav } from '../../nav/NavContext.tsx';
import { pressable } from '../../pressable.ts';
import { AgentChip } from '../chips/Chips.tsx';
import { countOf, stateClass, TrackMarks } from '../issues/EventTrack.tsx';
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

/** 端に貼り付いた目盛りはラベルが列から溢れる。課題の一覧と同じところで落とす */
const TICK_EDGE_PCT = 3;

/** 記録が届く前の束。毎回作ると、行が中身の同じ値で描き直される */
const EMPTY_GROUP: GroupTrack = { track: { kind: 'reading' }, unread: 0, openedMs: null };

export interface MilestonesProps {
  readonly issues: readonly IssueSummaryJson[];
  readonly workers: WorkerIndex;
  readonly join: WorkJoin | undefined;
  readonly project: ProjectJson | undefined;
  /** ツールバー。単位の切り替えを含めて、呼ぶ側が組む */
  readonly lead: React.ReactNode;
  readonly query: string;
  /** 右のタイムラインが一度に見せる幅。課題の一覧と同じ軸である */
  readonly ganttWindow: GanttWindow;
  /* 課題に起きたことの記録。**一覧とは別に届く** —— 届く前でも一覧は開くので、
     `reading` のまま描き始める。 */
  readonly eventLog: EventLog;
  readonly nowMs: number;
}

export function Milestones({
  issues,
  workers,
  join,
  project,
  lead,
  query,
  ganttWindow,
  eventLog,
  nowMs,
}: MilestonesProps) {
  const t = useT();
  const rows = useMemo(() => buildMilestones(issues, join, workers), [issues, join, workers]);

  const needle = query.trim().toLowerCase();
  const shown =
    needle === '' ? rows : rows.filter((row) => (row.title ?? '').toLowerCase().includes(needle));

  /* 課題の一覧と同じ時間軸。**出ている行の課題だけで決める** —— 絞り込みで消えた区切りの
     課題まで数えると、画面に無いもののために軸が伸びて、残った行の点が狭いところへ潰れる。 */
  const listed = useMemo(() => shown.flatMap((row) => row.issues), [shown]);
  const axis = useMemo(() => ganttAxis(listed, ganttWindow, nowMs), [listed, ganttWindow, nowMs]);
  const ticks = useMemo(() => ganttTicks(axis.t0, axis.t1), [axis]);
  const axisSpan = axis.t1 - axis.t0;
  /* 縦の線は課題の一覧と同じものを引く。**期日はこの表の行そのものでもある** —— 自分の行の
     線が自分の期日を通るので、行と行の間で読み比べられる */
  const gridImage = useMemo(
    () => ganttGridImage(ganttGuides(listed, axis), axis, nowMs),
    [listed, axis, nowMs],
  );

  /* 束ごとのトラックを、行の外で 1 度だけ組む。行の中で組むと、どれか 1 行に触れただけで
     全部の行の点が組み直される。 */
  const tracks = useMemo(() => {
    const found = new Map<string, GroupTrack>();
    for (const row of shown) found.set(row.title ?? '', groupTrack(row.issues, eventLog, axis));
    return found;
  }, [shown, eventLog, axis]);

  return (
    <>
      {lead}
      {shown.length === 0 ? (
        <p className="empty">
          {rows.length === 0
            ? t('No milestones on the issues fetched from GitHub')
            : t('No matching milestones (0 of {total})', { total: rows.length })}
        </p>
      ) : (
        <div id="ms-list" style={{ ['--gt-grid' as string]: gridImage }}>
          <div className="ms-row head">
            <span>{t('Milestone')}</span>
            <span>{t('Due')}</span>
            <span>{t('Progress')}</span>
            <span className="right">{t('Open')}</span>
            <span className="right">{t('Blocked')}</span>
            <span>{t('Branches')}</span>
            <span>{t('Agents')}</span>
            {/* 目盛りは課題の一覧と同じ引き方で、軸の位置そのものに置く。同じ密度の 2 つの表を
                行き来するので、目盛りの読み方まで別にしない */}
            <span className="gt-head">
              {ticks.map((tick) => {
                const x = atPct(tick, axis);
                // 端に貼り付いた目盛りはラベルが列から溢れる
                if (x < TICK_EDGE_PCT || x > 100 - TICK_EDGE_PCT) return null;
                return (
                  <span key={tick} className="tick" style={{ left: `${x}%` }}>
                    {formatGanttTick(tick, axisSpan)}
                  </span>
                );
              })}
            </span>
          </div>
          {shown.map((row) => (
            <MilestoneLine
              key={row.title ?? ''}
              row={row}
              project={project}
              axis={axis}
              group={tracks.get(row.title ?? '') ?? EMPTY_GROUP}
              nowMs={nowMs}
            />
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
        <span className="lg-gt">
          <i className="gt-open" /> the first issue here was opened
        </span>
        <span className="lg-gt">
          <i className="gt-ev" /> something happened on one of these issues
        </span>
        <span className="lg-gt">
          <i className="gt-due" /> the due date, on the axis
        </span>
        <span className="lg-gt">
          <b className="gt-off unplaced">?n</b> issues here whose events were not read
        </span>
        <span>press a named row to see just that milestone in the issue list</span>
      </div>
    </>
  );
}

function MilestoneLine({
  row,
  project,
  axis,
  group,
  nowMs,
}: {
  row: MilestoneRow;
  project: ProjectJson | undefined;
  axis: GanttAxis;
  group: GroupTrack;
  nowMs: number;
}) {
  const t = useT();
  const nav = useNav();
  const dueMs = row.dueOn === null ? null : Date.parse(row.dueOn);
  const soon = dueMs !== null && Number.isFinite(dueMs) && dueMs - nowMs < SOON_MS;
  const done = row.total === 0 ? 0 : row.closed / row.total;

  /* 束のトラック。**線も輪も、束の課題たちが観測された時刻だけで引く** —— 期日は GitHub が
     言う唯一の先の日付だが、観測した時刻ではないので線の端にはしない。

     読んでいる最中は、点も輪も出さない。輪だけが在る絵は「読み終えて何も起きていなかった」
     という別の答えである。 */
  const track = group.track;
  const quiet = track.kind === 'reading';
  const open = quiet ? null : openMarkOf(group.openedMs, axis);
  const ends = trackEndsOf(group.openedMs, track, null);
  const line = trackLineOf(ends, axis);
  const cutRegion = track.kind === 'read' ? track.cut : null;

  /* 期日を軸の上に置く。**軸の中に入るときだけ置く** —— 外れたことは Due の欄が言葉で
     言っているので、端へ寄せてもう 1 つ置くと、同じことを 2 つの形で言うことになる。 */
  const duePct =
    dueMs !== null && Number.isFinite(dueMs) && dueMs >= axis.t0 && dueMs <= axis.t1
      ? atPct(dueMs, axis)
      : null;

  /* 押しどころとして出すのは、行ける先を持つ行だけである。役もフォーカスの順も名前も
     まとめてここで決める —— 3 つのうち 1 つだけが残ると、辿れるのに動かない行になる。 */
  const title = row.title;
  const press =
    title === null
      ? {}
      : {
          role: 'button' as const,
          tabIndex: 0,
          'aria-label': t('Show issues in {title}', { title }),
          ...pressable(() => nav.gotoMilestone(title)),
        };

  return (
    /* マイルストーンの付いていない束は、押しても行き先が無い。**押しどころとして出さない**
       —— `ms` はマイルストーンの名前で絞る仕組みで、「付いていない」を表す綴りを持たない。
       名前として通せる綴りはどれも実在の名前と衝突しうるので、行ける先が無いことを
       そのまま出す。 */
    <div className={`ms-row${title === null ? ' none' : ''}`} {...press}>
      <span className="ms-name">
        <Icon path={mdiFlagOutline} size={11} />
        {/* 名前が無いことを名前で表さない。付いていない課題の束であることをそのまま言う */}
        {title === null ? (
          <em>{t('no milestone')}</em>
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
          <span title={absTime(row.dueOn)}>{formatDue(t, row.dueOn, nowMs)}</span>
        )}
      </span>

      <span
        className="epic-prog"
        title={t('{closed}/{total} closed', { closed: row.closed, total: row.total })}
      >
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
            title={t('Open branch {name}', { name: branch })}
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
            via={viaLabel(t, worker)}
          />
        ))}
        {row.workers.length > MAX_LISTED_WORKERS && (
          <span className="g-more">+{row.workers.length - MAX_LISTED_WORKERS}</span>
        )}
      </span>

      {/* 束に起きたことのトラック。課題の一覧と同じ軸で、同じ読み方をする。

          **子は絶対配置の要素だけを平らに並べる。** 包む要素を足すと `subgrid` が切れる。
          並べた順がそのまま重なりの順で、線とハッチが下、点が上、期日がいちばん上になる */}
      <span
        className={`gt${stateClass(track)}`}
        title={groupTitle(t, track, group.unread, row.total)}
      >
        {/* 読めなかった課題の数。左端で言う —— 軸の上に置ける時刻を持たないものである */}
        {group.unread > 0 && track.kind === 'read' && (
          <b
            className="gt-off left unplaced"
            title={t(
              '{n, plural, one {# issue in this milestone was not in the event log that was read, so nothing from it is on this line} other {# issues in this milestone were not in the event log that was read, so nothing from them is on this line}}',
              { n: group.unread },
            )}
          >
            ?{group.unread}
          </b>
        )}
        {line !== null && ends !== null && (
          <i
            className={`gt-line${line.softFrom ? ' soft-from' : ''}${line.softTo ? ' soft-to' : ''}`}
            style={{ left: `${line.left}%`, width: `${line.width}%` }}
            title={groupLineTitle(t, ends.fromMs, ends.toMs, line.softFrom, line.softTo)}
          />
        )}
        {cutRegion !== null && (
          <i
            className={`gt-cut${cutRegion.softFrom ? ' soft-from' : ''}${cutRegion.softTo ? ' soft-to' : ''}`}
            style={{ left: `${cutRegion.left}%`, width: `${cutRegion.width}%` }}
            title={t(
              'Only the 30 most recent events were read for at least one issue here — anything before {to} is not shown',
              { to: absTime(cutRegion.toMs) },
            )}
          />
        )}
        {open !== null && (
          <i
            className={`gt-open${open.pct <= 0 ? ' at-start' : open.pct >= 100 ? ' at-end' : ''}${
              open.clamped === 'before' ? ' soft-from' : ''
            }${open.clamped === 'after' ? ' soft-to' : ''}`}
            style={{ left: `${open.pct}%` }}
            title={t('The first issue here was opened {at}{clamped}', {
              at: absTime(open.at),
              clamped:
                open.clamped === null ? '' : t(', outside this span — the ring sits at the edge'),
            })}
          />
        )}
        <TrackMarks track={track} />
        {/* 期日。**閉じた時刻のフラグと同じ形にしない** —— あちらは観測した時刻で、こちらは
            GitHub が言う先の日付である。縦の線と同じ色を使って、同じものだと言う */}
        {duePct !== null && row.dueOn !== null && (
          <i
            className="gt-due"
            style={{ left: `${duePct}%` }}
            title={t('Due {at}', { at: absTime(row.dueOn) })}
          />
        )}
      </span>
    </div>
  );
}

/* 束のトラック全体の説明。**課題 1 件の説明と同じ言葉にしない** —— 「この課題は記録に
   居なかった」と「この区切りの課題が記録に居なかった」は別の文である。 */
function groupTitle(t: Translator, track: RowTrack, unread: number, total: number): string {
  const missing =
    unread === 0
      ? ''
      : t(
          '{n, plural, one { — # issue of {total} was not in the event log, so nothing from it is drawn here} other { — # issues of {total} were not in the event log, so nothing from them is drawn here}}',
          { n: unread, total },
        );
  if (track.kind === 'reading') return t('Reading the issue event log');
  if (track.kind === 'nolog') return t('This project has no issue event log');
  if (track.kind === 'unread') {
    if (track.why === 'log') return t('Issue events could not be read');
    if (track.why === 'row') {
      return t('None of the issues here were in the event log that was read');
    }
    if (track.why === 'unreadable') {
      return t('The time on {what} could not be read, so nothing is drawn here', {
        what: countOf(t, track.dropped, 'event'),
      });
    }
    return t('The event log was cut short before it reached any issue here');
  }
  if (track.count === 0 || track.lastAt === null) {
    return t('No events on record for the {what} here{missing}', {
      what: countOf(t, total, 'issue'),
      missing,
    });
  }
  return t('{what} across {across}, the last on {at}{missing}', {
    what: countOf(t, track.count, 'event'),
    across: countOf(t, total, 'issue'),
    at: absTime(track.lastAt),
    missing,
  });
}

/* 線が結ぶ 2 つの時刻。**長さは言わない** —— 端を軸で止めているときは描いた長さが本当の
   間隔ではないうえ、そもそもこの 2 つの時刻の間を観測したわけではない。 */
function groupLineTitle(
  t: Translator,
  fromMs: number,
  toMs: number,
  softFrom: boolean,
  softTo: boolean,
): string {
  const spans = t('First issue opened {from} — last event {to}', {
    from: absTime(fromMs),
    to: absTime(toMs),
  });
  const stopped = [
    softFrom ? t('it starts before this span') : '',
    softTo ? t('it runs past this span') : '',
  ].filter((clause) => clause !== '');
  if (stopped.length === 0) return spans;
  return t(
    '{spans}. The line stops at the edge of this span: {stopped} — widen the span to see all of it.',
    { spans, stopped: stopped.join(t(' and ')) },
  );
}
