import { mdiCommentOutline, mdiGithub, mdiHeartOutline, mdiSourceBranch } from '@mdi/js';
import { useMemo } from 'react';
import type { IssueSummaryJson } from '~/interface/presenters/issues/issues.presenter.ts';
import type { ProjectJson } from '~/interface/presenters/sessions/tree.presenter.ts';
import { labelColors, subProgress } from '../../derive/githubIssue.ts';
import { viaLabel, workerIndex, workersOn } from '../../derive/workers.ts';
import { absTime, formatSinceIso } from '../../format.ts';
import { useNav } from '../../nav/NavContext.tsx';
import { ActivityLanes, resolveActivityRows } from '../activity/ActivityLanes.tsx';
import { AgentChip } from '../chips/Chips.tsx';
import { type GraphNode, MiniGraph } from '../issues/MiniGraph.tsx';
import { AvatarStack } from '../primitives/Avatar.tsx';
import { Icon } from '../primitives/Icon.tsx';
import { NotObserved } from '../primitives/NotObserved.tsx';
import { SubjectText } from '../text/SubjectText.tsx';

/* GitHub の課題 1 件のパネル。

   **本文は持っていない。** 一覧を引くときに本文まで求めると、100 件ぶんの markdown を
   運ぶことになって一覧そのものが開かなくなる。だからここに出せるのは、一覧と同じ欄で
   組み立てられるところまでである —— 出せないものは、出せないと書いて GitHub へ渡す。

   代わりに、GitHub の画面には無いものを並べてある。いまこの課題を触っているエージェント、
   その稼働区間、PR が乗っているブランチ。**それがこのパネルの値打ちである。** */

/** パネルに並べるエージェントのチップの数 */
const MAX_LISTED_WORKERS = 4;

/** 前後に並べる繋がりの数 */
const MAX_GRAPH_NODES = 6;

/** 稼働区間のバーに出すエージェントの数 */
const MAX_ACTIVITY_ROWS = 8;

/** 顔の数 */
const MAX_FACES = 4;

export interface GithubIssueDetailProps {
  readonly issue: IssueSummaryJson;
  /** 取ってきた課題の全部。下流(この課題を待っている側)はここから引く */
  readonly all: readonly IssueSummaryJson[];
  readonly project: ProjectJson | undefined;
  readonly nowMs: number;
}

export function GithubIssueDetail({ issue, all, project, nowMs }: GithubIssueDetailProps) {
  const nav = useNav();
  const workers = useMemo(() => workerIndex(project), [project]);
  const id = issue.id ?? '';
  const github = issue.github;
  const byId = useMemo(() => new Map(all.map((other) => [other.id, other])), [all]);

  const upstream = issue.deps.filter((dependency) => dependency.on !== null);
  const downstream = all.filter((other) => other.deps.some((dependency) => dependency.on === id));

  const left: GraphNode[] = upstream.slice(0, MAX_GRAPH_NODES).map((dependency) => {
    const on = dependency.on ?? '';
    return {
      id: on,
      type: dependency.type ?? '',
      status: byId.get(on)?.status ?? null,
      title: byId.get(on)?.title ?? null,
    };
  });
  const right: GraphNode[] = downstream.slice(0, MAX_GRAPH_NODES).map((other) => ({
    id: other.id ?? '',
    type: other.deps.find((dependency) => dependency.on === id)?.type ?? '',
    status: other.status,
    title: other.title,
  }));

  /* 動いているものを先に。終わった記録は、いま誰が触っているかの後ろでよい */
  const found = [...workersOn(workers, issue)].sort(
    (a, b) => (a.state === 'ended' ? 1 : 0) - (b.state === 'ended' ? 1 : 0),
  );
  const lanes = resolveActivityRows(project, found.slice(0, MAX_ACTIVITY_ROWS));

  const colors = labelColors(issue);
  const labels = issue.labels ?? [];
  const progress = subProgress(issue, undefined);
  const milestone = github?.milestone ?? null;

  return (
    <div className="detail">
      <div id="detail-header">
        <span className="title">{id}</span>
        <span className={`chip st-${issue.status}`}>{issue.status}</span>
        {github?.url != null && (
          <a className="lnk gh-out" href={github.url} target="_blank" rel="noopener">
            <Icon path={mdiGithub} size={12} /> GitHub
          </a>
        )}
        <div className="sub">
          {issue.title !== null && <SubjectText text={issue.title} project={project} />}
        </div>
      </div>

      <div className="detail-body">
        <div className="meta-grid">
          <span className="mk">type</span>
          <span>
            {issue.issue_type === null ? (
              <span className="dimtxt">—</span>
            ) : (
              <span
                className={`tchip t-${issue.issue_type}${github?.issue_type_color == null ? '' : ' tinted'}`}
                style={
                  github?.issue_type_color == null
                    ? undefined
                    : { ['--lc' as string]: `#${github.issue_type_color}` }
                }
              >
                {issue.issue_type}
              </span>
            )}
          </span>

          <span className="mk">assignees</span>
          <span className="mv-agents">
            {github !== null && github.assignees.length > 0 ? (
              <AvatarStack actors={github.assignees} max={MAX_FACES} />
            ) : (
              <span className="dimtxt">—</span>
            )}
          </span>

          <span className="mk">author</span>
          <span className="mv-agents">
            {github?.author == null ? (
              <span className="dimtxt">—</span>
            ) : (
              <>
                <AvatarStack actors={[github.author]} max={1} />
                <span>{github.author.login}</span>
              </>
            )}
          </span>

          <span className="mk">milestone</span>
          <span>
            {milestone === null ? (
              <span className="dimtxt">—</span>
            ) : (
              <button
                type="button"
                className="lnk"
                title={`Show just ${milestone.title}`}
                onClick={() => nav.gotoMilestone(milestone.title)}
              >
                {milestone.title}
                {milestone.due_on !== null && (
                  <span className="dimtxt"> · due {absTime(milestone.due_on)}</span>
                )}
              </button>
            )}
          </span>

          {progress !== null && progress.total > 0 && (
            <>
              <span className="mk">sub-issues</span>
              <span>
                <span className="epic-prog" title={`${progress.closed}/${progress.total} closed`}>
                  <span className="epic-bar">
                    <i style={{ width: `${(progress.closed / progress.total) * 100}%` }} />
                  </span>
                  <b>
                    {progress.closed}/{progress.total}
                  </b>
                </span>
              </span>
            </>
          )}

          <span className="mk">pull requests</span>
          <span className="mv-agents">
            {github === null || github.pull_requests.length === 0 ? (
              <span className="dimtxt">—</span>
            ) : (
              github.pull_requests.map((pull) => (
                <span key={pull.number} className="pr-line">
                  <span
                    className={`prchip ${pull.is_draft ? 'draft' : pull.state.toLowerCase()}`}
                    title={`Pull request #${pull.number}`}
                  >
                    #{pull.number}
                  </span>
                  {pull.head_ref_name !== null && (
                    <button
                      type="button"
                      className="brstate"
                      title={`Open branch ${pull.head_ref_name}`}
                      onClick={() =>
                        pull.head_ref_name !== null &&
                        nav.openRef(pull.head_ref_name, pull.head_ref_name)
                      }
                    >
                      <Icon path={mdiSourceBranch} size={10} />
                      <span className="brname">{pull.head_ref_name}</span>
                    </button>
                  )}
                </span>
              ))
            )}
          </span>

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

          <span className="mk">reactions</span>
          <span className="dimtxt">
            <Icon path={mdiCommentOutline} size={11} /> {github?.comments ?? 0}
            {'   '}
            <Icon path={mdiHeartOutline} size={11} /> {github?.reactions ?? 0}
          </span>

          <span className="mk">updated</span>
          <span>
            {absTime(issue.updated_at)}{' '}
            <span className="dimtxt">({formatSinceIso(issue.updated_at, nowMs)})</span>
          </span>
          <span className="mk">created</span>
          <span>
            {absTime(issue.created_at)}{' '}
            <span className="dimtxt">({formatSinceIso(issue.created_at, nowMs)})</span>
          </span>
        </div>

        {labels.length > 0 && (
          <div className="lbls">
            {labels.map((label) => {
              const color = colors.get(label);
              return (
                <button
                  type="button"
                  key={label}
                  className={`lbl${color === undefined ? '' : ' tinted'}`}
                  style={color === undefined ? undefined : { ['--lc' as string]: `#${color}` }}
                  onClick={() => nav.gotoIssues(label)}
                >
                  {label}
                </button>
              );
            })}
          </div>
        )}

        <MiniGraph selfId={id} selfStatus={issue.status} left={left} right={right} />
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

        {/* 本文が無いことを黙らない。空のまま出すと、本文の無い課題に見える */}
        <NotObserved
          partial
          icon={mdiGithub}
          title="The description is not read"
          detail="glasshive fetches the fields it can draw with — labels, dependencies, assignees, pull requests — but not the body text. Carrying a body for every issue is what makes a list of this size slow to open."
          {...(github?.url == null
            ? {}
            : { steps: [{ text: 'Read the whole issue on GitHub', href: github.url }] })}
        />
      </div>
    </div>
  );
}
