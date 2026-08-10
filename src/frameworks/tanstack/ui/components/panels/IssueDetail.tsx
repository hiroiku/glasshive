import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import type { JsonValue } from '~/interface/presenters/issues/issues.presenter.ts';
import type { ProjectJson } from '~/interface/presenters/sessions/tree.presenter.ts';
import { githubIssuesQuery, issueQuery, issuesQuery } from '../../../queries/issues.query.ts';
import { agentTokens } from '../../derive/tokens.ts';
import { issueTrouble, transportTrouble } from '../../derive/trouble.ts';
import { viaLabel, workerIndex, workersOn } from '../../derive/workers.ts';
import { absTime, formatSinceIso } from '../../format.ts';
import { useNav } from '../../nav/NavContext.tsx';
import { ActivityLanes, resolveActivityRows } from '../activity/ActivityLanes.tsx';
import { AgentChip } from '../chips/Chips.tsx';
import { type GraphNode, MiniGraph } from '../issues/MiniGraph.tsx';
import { NotObserved } from '../primitives/NotObserved.tsx';
import { ReadProgress } from '../primitives/ReadProgress.tsx';
import { MdView } from '../text/MdView.tsx';
import { SubjectText } from '../text/SubjectText.tsx';
import { GithubIssueDetail } from './GithubIssueDetail.tsx';

/* 課題 1 件のパネル。台帳が言うことと、観測が言うことを並べて置く。

   台帳の中身は bd が決めている。**欄ごとに型を確かめて読む** — バージョンが変われば
   欄も変わるので、読めない欄は無かったことにして、読めた欄だけを出す。 */

/** パネルに並べるエージェントのチップの数 */
const MAX_LISTED_WORKERS = 4;

/** 前後に並べる繋がりの数。溢れたぶんは件数だけ添える */
const MAX_GRAPH_NODES = 6;

/** 稼働区間のバーに出すエージェントの数 */
const MAX_ACTIVITY_ROWS = 8;

type Record_ = Readonly<Record<string, JsonValue>>;

const str = (record: Record_, key: string): string | null => {
  const value = record[key];
  return typeof value === 'string' && value !== '' ? value : null;
};

const num = (record: Record_, key: string): number | null => {
  const value = record[key];
  return typeof value === 'number' ? value : null;
};

const list = (record: Record_, key: string): readonly JsonValue[] => {
  const value = record[key];
  return Array.isArray(value) ? value : [];
};

const strings = (record: Record_, key: string): string[] =>
  list(record, key).filter((item): item is string => typeof item === 'string');

const objects = (record: Record_, key: string): Record_[] =>
  list(record, key).filter(
    (item): item is Record_ => typeof item === 'object' && item !== null && !Array.isArray(item),
  );

export function IssueDetail({ id, project }: { id: string; project: ProjectJson | undefined }) {
  const nav = useNav();
  const slug = project?.id ?? '';
  const one = useQuery({ ...issueQuery(slug, id), enabled: slug !== '' });
  const ledger = useQuery({ ...issuesQuery(slug, false), enabled: slug !== '' });
  /* GitHub の課題を開いたときの受け皿。**同じ `queryKey` を使う** —— Work の画面が既に
     取ってあるので、ここで開いても `gh` はもう一度動かない。 */
  const tracker = useQuery({ ...githubIssuesQuery(slug, true), enabled: slug !== '' });
  const workers = useMemo(() => workerIndex(project), [project]);
  /* コメントの書き手は名前でしか書かれていない。命名規則を頼りに会話へ辿る */
  const actors = useMemo(() => agentTokens(project), [project]);

  const answer = one.data;
  /* 台帳と GitHub は、同じ画面が並べて出す 2 つの出所である。**台帳に無いことは失敗ではない**
     —— GitHub の課題を開けば、台帳には最初から居ない。 */
  const tracked =
    tracker.data?.ok === true && tracker.data.body.state === 'observed'
      ? tracker.data.body.issues
      : [];
  const github = tracked.find((issue) => issue.id === id);

  const ledgerRecord =
    answer?.ok === true && answer.body.state === 'observed' ? answer.body.issue : null;

  if (ledgerRecord === null) {
    if (github !== undefined) {
      return (
        <GithubIssueDetail issue={github} all={tracked} project={project} nowMs={Date.now()} />
      );
    }
    /* 断りも「無かった」も `.detail` の中に出す。外に出すと余白も中央寄せも無い素の文字が
       左上に残る。 */
    if (one.error !== null) {
      return (
        <div className="detail">
          <NotObserved {...transportTrouble('this issue')} />
        </div>
      );
    }
    if (answer === undefined || tracker.data === undefined) {
      return <ReadProgress label="Reading the issue" />;
    }
    return (
      <div className="detail">
        <NotObserved {...issueTrouble(id, answer.ok ? null : answer.body.code)} />
      </div>
    );
  }
  const record = ledgerRecord;
  const status = str(record, 'status') ?? 'open';
  const title = str(record, 'title');
  const labels = strings(record, 'labels');
  const nowMs = Date.now();

  const listed = ledger.data?.ok === true ? ledger.data.body.issues : [];
  const byId = new Map(listed.map((issue) => [issue.id, issue]));

  const upstream = objects(record, 'dependencies').filter(
    (dependency) => str(dependency, 'depends_on_id') !== null,
  );
  const downstream = listed.filter((issue) =>
    issue.deps.some((dependency) => dependency.on === id),
  );

  const left: GraphNode[] = upstream.slice(0, MAX_GRAPH_NODES).map((dependency) => {
    const on = str(dependency, 'depends_on_id') ?? '';
    return {
      id: on,
      type: str(dependency, 'type') ?? '',
      status: byId.get(on)?.status ?? null,
      title: byId.get(on)?.title ?? null,
    };
  });
  const right: GraphNode[] = downstream.slice(0, MAX_GRAPH_NODES).map((issue) => ({
    id: issue.id ?? '',
    type: issue.deps.find((dependency) => dependency.on === id)?.type ?? '',
    status: issue.status,
    title: issue.title,
  }));

  /* 台帳の一覧に居ないなら、PR の欄も無い。**id の鍵だけで引くことになる** —
     GitHub の課題をここで開いたときがそれで、繋がりは会話の中の名指しだけになる。 */
  const found = [...workersOn(workers, { id, github: byId.get(id)?.github ?? null })].sort(
    (a, b) => (a.state === 'ended' ? 1 : 0) - (b.state === 'ended' ? 1 : 0),
  );
  const lanes = resolveActivityRows(project, found.slice(0, MAX_ACTIVITY_ROWS));
  const priority = num(record, 'priority');
  const issueType = str(record, 'issue_type');
  const assignee = str(record, 'assignee');

  return (
    <div className="detail">
      <div id="detail-header">
        <span className="title">{str(record, 'id') ?? id}</span>
        <span className={`chip st-${status}`}>{status}</span>
        <div className="sub">
          {title !== null && <SubjectText text={title} project={project} />}
        </div>
      </div>
      <div className="detail-body">
        <div className="meta-grid">
          <span className="mk">type</span>
          <span>
            {issueType === null ? (
              <span className="dimtxt">—</span>
            ) : (
              <span className={`tchip t-${issueType}`}>{issueType}</span>
            )}
          </span>
          <span className="mk">priority</span>
          <span>
            {priority === null ? (
              <span className="dimtxt">—</span>
            ) : (
              <span className={`pchip p${Math.min(priority, 4)}`}>P{priority}</span>
            )}
          </span>
          <span className="mk">assignee</span>
          <span>
            {assignee === null ? (
              <span className="dimtxt">—</span>
            ) : (
              <button type="button" className="lnk" onClick={() => nav.gotoIssues(assignee)}>
                {assignee}
              </button>
            )}
          </span>
          <span className="mk">owner</span>
          <span>{str(record, 'owner') ?? <span className="dimtxt">—</span>}</span>
          <span className="mk">agents</span>
          <span className="mv-agents">
            {found.length === 0 ? (
              <span className="dimtxt">—</span>
            ) : (
              <>
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
                  <span className="g-more">+{found.length - MAX_LISTED_WORKERS}</span>
                )}
              </>
            )}
          </span>
          <span className="mk">updated</span>
          <span>
            {absTime(str(record, 'updated_at'))}{' '}
            <span className="dimtxt">({formatSinceIso(str(record, 'updated_at'), nowMs)})</span>
          </span>
          <span className="mk">created</span>
          <span>
            {absTime(str(record, 'created_at'))}{' '}
            <span className="dimtxt">({formatSinceIso(str(record, 'created_at'), nowMs)})</span>
          </span>
        </div>
        {labels.length > 0 && (
          <div className="lbls">
            {labels.map((label) => (
              <button
                type="button"
                key={label}
                className="lbl"
                onClick={() => nav.gotoIssues(label)}
              >
                {label}
              </button>
            ))}
          </div>
        )}
        <MiniGraph selfId={str(record, 'id') ?? id} selfStatus={status} left={left} right={right} />
        {(upstream.length > MAX_GRAPH_NODES || downstream.length > MAX_GRAPH_NODES) && (
          <div className="mg-more">
            {upstream.length > MAX_GRAPH_NODES &&
              `+${upstream.length - MAX_GRAPH_NODES} more upstream `}
            {downstream.length > MAX_GRAPH_NODES &&
              `+${downstream.length - MAX_GRAPH_NODES} more downstream`}
          </div>
        )}
        {lanes.length > 0 && (
          <>
            <div className="sec-h">Agent activity</div>
            <ActivityLanes rows={lanes} nowMs={nowMs} />
          </>
        )}
        <Section text={str(record, 'description')} project={project} />
        <Section
          label="Acceptance criteria"
          text={str(record, 'acceptance_criteria')}
          project={project}
        />
        <Section label="Design" text={str(record, 'design')} project={project} />
        <Section label="Notes" text={str(record, 'notes')} project={project} />
        <Section label="Close reason" text={str(record, 'close_reason')} project={project} />
        <Comments record={record} project={project} actors={actors} nowMs={nowMs} />
      </div>
    </div>
  );
}

/** 見出しの付いた本文。中身が無ければ見出しごと出さない */
function Section({
  label,
  text,
  project,
}: {
  label?: string;
  text: string | null;
  project: ProjectJson | undefined;
}) {
  if (text === null) return null;
  return (
    <>
      {label !== undefined && <div className="sec-h">{label}</div>}
      <MdView text={text} project={project} />
    </>
  );
}

function Comments({
  record,
  project,
  actors,
  nowMs,
}: {
  record: Record_;
  project: ProjectJson | undefined;
  actors: ReadonlyMap<string, { file: string; state: string }>;
  nowMs: number;
}) {
  const comments = objects(record, 'comments');
  if (comments.length === 0) return null;
  return (
    <>
      <div className="sec-h">Comments {comments.length}</div>
      {comments.map((comment, index) => {
        const who = str(comment, 'author') ?? str(comment, 'created_by') ?? '';
        const agent = actors.get(who);
        const at = str(comment, 'created_at');
        return (
          // biome-ignore lint/suspicious/noArrayIndexKey: 台帳のコメントは足すだけで、並びが identity である
          <div key={`${who}:${at}:${index}`} className="cmt">
            <div className="cmt-h">
              {agent === undefined ? (
                who
              ) : (
                <AgentChip file={agent.file} state={agent.state} label={who} />
              )}{' '}
              <span>{formatSinceIso(at, nowMs)}</span>
            </div>
            <MdView
              text={str(comment, 'text') ?? str(comment, 'content') ?? ''}
              project={project}
            />
          </div>
        );
      })}
    </>
  );
}
