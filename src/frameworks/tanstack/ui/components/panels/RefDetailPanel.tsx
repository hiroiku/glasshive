import { mdiSourceBranch } from '@mdi/js';
import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import type { ProjectJson } from '~/interface/presenters/sessions/tree.presenter.ts';
import { gitRefQuery } from '../../../queries/git.query.ts';
import { cut, formatSinceIso, worktreeName } from '../../format.ts';
import { ActivityLanes, resolveActivityRows } from '../activity/ActivityLanes.tsx';
import { AgentChip } from '../chips/Chips.tsx';
import { Icon } from '../primitives/Icon.tsx';
import { SubjectText } from '../text/SubjectText.tsx';

/* `ref` 1 つのパネル。何が変わったか、誰が触っているか。

   **`ref` に居るエージェントは、名前の突き合わせで引く。** `git` の側は誰が居るかを
   知らないので、ブランチの名か worktree の名が一致するエージェントを観測から拾う。 */

/** ヘッダーに並べるエージェントのチップの数 */
const MAX_LISTED_AGENTS = 5;

/** 稼働区間のバーに出すエージェントの数 */
const MAX_ACTIVITY_ROWS = 8;

/** ラベルの最大長 */
const MAX_LABEL = 24;

interface RefAgent {
  readonly file: string;
  readonly state: string;
  readonly label: string;
  readonly where: string;
}

/* この `ref` の上に居るエージェント。ブランチの名がそのまま一致するか、worktree の名の末尾が
   一致するか。

   末尾で見るのは、worktree のパスが `.worktrees/<name>` の形になるからである。 */
function refAgents(project: ProjectJson | undefined, label: string): RefAgent[] {
  const found: RefAgent[] = [];
  if (project === undefined) return found;
  const leaf = label.split('/').pop() ?? label;

  const add = (
    file: string,
    state: string,
    name: string,
    branch: string | null,
    cwd: string | null,
  ) => {
    const where = worktreeName(cwd);
    if (branch !== label && where !== leaf) return;
    if (found.some((other) => other.file === file)) return;
    found.push({ file, state, label: cut(name, MAX_LABEL), where });
  };

  for (const session of project.sessions) {
    add(
      session.file,
      session.state,
      session.title ?? session.id.slice(0, 8),
      session.git_branch,
      session.cwd,
    );
    for (const subagent of session.subagents) {
      add(subagent.file, subagent.state, subagent.label, subagent.git_branch, subagent.cwd);
    }
  }
  // 生きているエージェントを先に。終わったものは文脈でしかない
  return found.sort((a, b) => (a.state === 'ended' ? 1 : 0) - (b.state === 'ended' ? 1 : 0));
}

export function RefDetailPanel({
  rev,
  label,
  project,
}: {
  rev: string;
  label: string;
  project: ProjectJson | undefined;
}) {
  const slug = project?.id ?? '';
  const ref = useQuery({ ...gitRefQuery(slug, rev), enabled: slug !== '' });
  const agents = useMemo(() => refAgents(project, label), [project, label]);
  const nowMs = Date.now();

  const answer = ref.data;
  if (answer === undefined) return <div className="empty">Loading…</div>;
  if (!answer.ok) return <div className="empty">Failed to load ref ({answer.body.code})</div>;

  const detail = answer.body;
  if (detail.state === 'absent') {
    return <div className="empty">No commits found for this ref</div>;
  }

  const lanes = resolveActivityRows(project, agents.slice(0, MAX_ACTIVITY_ROWS));

  return (
    <div className="detail">
      <div id="detail-header">
        <span className="title">
          <Icon path={mdiSourceBranch} size={13} /> {label}
        </span>
        <div className="sub">
          {detail.unique && detail.base !== null
            ? `${detail.commits.length} commits ahead of ${detail.base}`
            : 'recent history'}
          {' · '}
          {rev}
        </div>
        {agents.length > 0 && (
          <div className="agent-ctx">
            <span className="ctx-g">
              <span className="mk">agents</span>
              {agents.slice(0, MAX_LISTED_AGENTS).map((agent) => (
                <AgentChip
                  key={agent.file}
                  file={agent.file}
                  state={agent.state}
                  label={agent.label}
                />
              ))}
              {agents.length > MAX_LISTED_AGENTS && (
                <span className="g-more">+{agents.length - MAX_LISTED_AGENTS}</span>
              )}
            </span>
          </div>
        )}
      </div>
      <div className="detail-body">
        {lanes.length > 0 && (
          <>
            <div className="sec-h">Agent activity</div>
            <ActivityLanes rows={lanes} nowMs={nowMs} />
          </>
        )}
        {detail.stat !== null && (
          <div className="ref-stat">
            <span className="rs-add">+{detail.stat.add}</span>
            <span className="rs-del">−{detail.stat.del}</span>
            <span className="dimtxt">
              in {detail.stat.files} files since {detail.base}
            </span>
            {detail.behind > 0 && (
              <span className="dimtxt">
                · behind {detail.base} by {detail.behind}
              </span>
            )}
          </div>
        )}
        {detail.files.length > 0 && (
          <>
            <div className="sec-h">Top changes</div>
            {detail.files.map((file) => (
              <div key={file.path} className="ref-file">
                <span className="rf-path" title={file.path}>
                  {file.path}
                </span>
                <span className="rs-add">+{file.add}</span>
                <span className="rs-del">−{file.del}</span>
              </div>
            ))}
          </>
        )}
        <div className="sec-h">Commits</div>
        {detail.commits.map((commit) => (
          <div key={commit.sha} className="ref-commit">
            <span className="g-sha">{commit.sha}</span>
            <span className="rc-subject" title={commit.subject}>
              <SubjectText text={commit.subject} project={project} />
            </span>
            <span className="rc-author" title={commit.author}>
              {commit.author}
            </span>
            <span className="g-date" title={commit.date}>
              {formatSinceIso(commit.date, nowMs)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
