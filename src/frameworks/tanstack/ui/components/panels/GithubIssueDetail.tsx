import { mdiCommentOutline, mdiGithub, mdiHeartOutline, mdiSourceBranch } from '@mdi/js';
import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import type { IssueSummaryJson } from '~/interface/presenters/issues/issues.presenter.ts';
import type { ProjectJson } from '~/interface/presenters/sessions/tree.presenter.ts';
import { githubIssueBodyQuery, githubIssueDiscussionQuery } from '../../../queries/issues.query.ts';
import { issueTypeColor, labelColors, subProgress } from '../../derive/githubIssue.ts';
import { viaLabel, workerIndex, workersOn } from '../../derive/workers.ts';
import { absTime, formatSinceIso } from '../../format.ts';
import { useNav } from '../../nav/NavContext.tsx';
import { ActivityLanes, resolveActivityRows } from '../activity/ActivityLanes.tsx';
import { AgentChip } from '../chips/Chips.tsx';
import { type GraphNode, MiniGraph } from '../issues/MiniGraph.tsx';
import { AvatarStack } from '../primitives/Avatar.tsx';
import { Icon } from '../primitives/Icon.tsx';
import { NotObserved } from '../primitives/NotObserved.tsx';
import { ReadingLines } from '../primitives/ReadingLines.tsx';
import { MdView } from '../text/MdView.tsx';
import { SubjectText } from '../text/SubjectText.tsx';
import { IssueDiscussion } from './IssueDiscussion.tsx';

/* GitHub の課題 1 件のパネル。

   **本文はここで、この 1 件だけを尋ねる。** 一覧を引くときに本文まで求めると、100 件ぶんの
   markdown を運ぶことになって一覧そのものが開かなくなる。開いた 1 件なら、`gh` を 1 回
   起こすだけで済む。

   加えて、GitHub の画面には無いものを並べてある。いまこの課題を触っているエージェント、
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
  /** `all` が一覧の全部か。ページを歩いている途中なら、下流はまだ揃っていない */
  readonly walked: boolean;
  readonly project: ProjectJson | undefined;
  readonly nowMs: number;
}

export function GithubIssueDetail({ issue, all, walked, project, nowMs }: GithubIssueDetailProps) {
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
  const typeColor = issueTypeColor(issue);
  const labels = issue.labels ?? [];
  const progress = subProgress(issue, undefined);
  const milestone = github?.milestone ?? null;

  /* 本文。**開いてから尋ねる。** id は `#209` の形なので、番号だけを取り出して渡す。
     取り出せなければ尋ねない —— 番号の分からない課題の本文は、そもそもどこにも無い。 */
  const number = Number.parseInt(id.replace(/^#/, ''), 10);
  const slug = project?.id ?? '';
  const askable = slug !== '' && Number.isSafeInteger(number) && number > 0;
  const body = useQuery({ ...githubIssueBodyQuery(slug, number), enabled: askable });
  const answer = body.data;
  const text = answer?.ok === true && answer.body.state === 'observed' ? answer.body.body : null;
  /* 読めなかった理由。`gh` が入っていないのか、認証が切れたのか、その番号が無かったのかは
     ここにしか残らない */
  const bodyReason =
    answer === undefined ? null : answer.ok ? answer.body.reason : (answer.body.code ?? null);

  /* やり取り。本文とは別に尋ねる —— 何ページにもなることがあり、同じ問い合わせにすると
     本文だけを見たい人まで全ページぶんを待つ。描くのは `IssueDiscussion` である。 */
  const discussion = useQuery({ ...githubIssueDiscussionQuery(slug, number), enabled: askable });

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
                className={`tchip${typeColor === null ? '' : ' tinted'}`}
                style={typeColor === null ? undefined : { ['--lc' as string]: typeColor }}
              >
                {issue.issue_type}
              </span>
            )}
          </span>

          <span className="mk">assignees</span>
          <span className="mv-agents">
            {github.assignees.length > 0 ? (
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
                {/* 隣に login をそのまま出している。顔にも名乗らせると 2 回読まれる */}
                <AvatarStack actors={[github.author]} max={1} decorative />
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
            {github.pull_requests.length === 0 ? (
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
        {/* 下流は取ってきた一覧からしか引けない。**足りないことを黙らない** —— 黙ると、
            まだ届いていないページに在る課題が「この課題を待っていない」ことになる */}
        {!walked && (
          <div className="mg-more">
            Still fetching issues — anything waiting on this one may not be listed yet
          </div>
        )}
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

        {/* 本文。**読めなかったことも、尋ねている最中であることも黙らない** —— どちらを
            黙っても、本文の無い課題として画面に出る。この 2 つは別の絵でなければならない。 */}
        {text !== null ? (
          text !== '' && <MdView text={text} source="github" project={project} />
        ) : body.isPending && askable ? (
          <ReadingLines lines={3} label="Reading the description" />
        ) : (
          <NotObserved
            partial
            icon={mdiGithub}
            title="The description did not come back"
            detail="The rest of this panel is built from the issue list, which glasshive already has. The body text is fetched on its own when you open an issue, and that fetch did not answer."
            {...(bodyReason === null ? {} : { code: bodyReason })}
            {...(github?.url == null
              ? {}
              : { steps: [{ text: 'Read the whole issue on GitHub', href: github.url }] })}
          />
        )}

        <IssueDiscussion
          answer={discussion.data}
          failed={discussion.error !== null}
          pending={discussion.isPending && askable}
          project={project}
          nowMs={nowMs}
          url={github?.url ?? null}
        />
      </div>
    </div>
  );
}
