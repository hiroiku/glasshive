import type {
  ProjectJson,
  SessionJson,
  SubagentJson,
} from '~/interface/presenters/sessions/tree.presenter.ts';
import { conversationTrouble } from '../../derive/trouble.ts';
import { cut, worktreeName } from '../../format.ts';
import { useTranscriptWindow } from '../../hooks/useTranscriptWindow.ts';
import { AgentChip, RefChip } from '../chips/Chips.tsx';
import { NotObserved } from '../primitives/NotObserved.tsx';
import { EventView } from './EventView.tsx';

/* 会話パネル。ヘッダーに「誰の会話か」、下に会話そのもの。

   URL が指すのは `transcript` のパスだけである。誰の会話かは、そのときのスナップショットから
   引き当てる — 検索パラメータに持たせると、URL を作った時点の姿が凍って、
   いま動いているかどうかが読めなくなる。 */

/** ヘッダーに並べるサブエージェントの数の上限。それ以上は件数だけ添える */
const MAX_LISTED_SUBAGENTS = 6;

/** ヘッダーの `working on` に並べる名前の数の上限 */
const MAX_LISTED_ISSUES = 3;

export interface Selected {
  readonly kind: 'session' | 'subagent';
  readonly node: SessionJson | SubagentJson;
}

/** `transcript` のパスから、いまのスナップショットのセッションかサブエージェントを引き当てる */
export function findByFile(project: ProjectJson | undefined, file: string): Selected | null {
  for (const session of project?.sessions ?? []) {
    if (session.file === file) return { kind: 'session', node: session };
    for (const subagent of session.subagents) {
      if (subagent.file === file) return { kind: 'subagent', node: subagent };
    }
  }
  return null;
}

/* エージェントから見た文脈。親・子・課題・`git` をヘッダーに束ねる。

   これが在ると、会話だけを見ていても「この子が何のために呼ばれたか」が読める。 */
function AgentContext({
  selected,
  project,
}: {
  selected: Selected;
  project: ProjectJson | undefined;
}) {
  if (project === undefined) return null;
  const node = selected.node;
  const worktree = worktreeName(node.cwd);
  const groups: React.ReactNode[] = [];

  if (selected.kind === 'session') {
    const session = selected.node as SessionJson;
    if (session.subagents.length > 0) {
      groups.push(
        <span key="subs" className="ctx-g">
          <span className="mk">subagents</span>
          {session.subagents.slice(0, MAX_LISTED_SUBAGENTS).map((subagent) => (
            <AgentChip
              key={subagent.file}
              file={subagent.file}
              state={subagent.state}
              label={cut(subagent.label, 16)}
            />
          ))}
          {session.subagents.length > MAX_LISTED_SUBAGENTS && (
            <span className="g-more">+{session.subagents.length - MAX_LISTED_SUBAGENTS}</span>
          )}
        </span>,
      );
    }
    if (session.issues.length > 0) {
      groups.push(
        <span key="work" className="ctx-g">
          <span className="mk">working on</span>
          {/* `.worktrees/<名前>` から拾った名前である。**チップにしない** — GitHub の課題の
              id ではないので、押しどころに見せると開く先が無いことが押すまで分からない */}
          {session.issues.slice(0, MAX_LISTED_ISSUES).map((id) => (
            <span key={id} className="wtname">
              {id}
            </span>
          ))}
        </span>,
      );
    }
  } else {
    const subagent = selected.node as SubagentJson;
    const parent = project.sessions.find((session) =>
      session.subagents.some((child) => child.file === subagent.file),
    );
    if (parent !== undefined) {
      groups.push(
        <span key="parent" className="ctx-g">
          <span className="mk">parent</span>
          <AgentChip
            file={parent.file}
            state={parent.state}
            label={cut(parent.title ?? parent.id.slice(0, 8), 22)}
          />
        </span>,
      );
    }
    if (subagent.issue !== null) {
      groups.push(
        <span key="work" className="ctx-g">
          <span className="mk">working on</span>
          <span className="wtname">{subagent.issue}</span>
        </span>,
      );
    }
  }

  if (node.git_branch !== null || worktree !== '') {
    groups.push(
      <span key="git" className="ctx-g">
        <span className="mk">git</span>
        {node.git_branch !== null && <RefChip name={node.git_branch} kind="branch" />}
        {worktree !== '' && <RefChip name={worktree} kind="worktree" />}
      </span>,
    );
  }

  return groups.length > 0 ? <div className="agent-ctx">{groups}</div> : null;
}

export function ConvPanel({
  file,
  project,
}: {
  file: string | null;
  project: ProjectJson | undefined;
}) {
  const selected = file === null ? null : findByFile(project, file);
  const node = selected?.node;
  const subtitle = node === undefined ? '' : [node.model, node.file].filter(Boolean).join(' · ');

  return (
    <>
      <div id="detail-header">
        {selected !== null && node !== undefined && (
          <>
            <span className="title">
              {selected.kind === 'session'
                ? ((selected.node as SessionJson).title ?? node.id)
                : (selected.node as SubagentJson).label}
            </span>
            <span className={`chip state-${node.state}`}>{node.state}</span>
            <div className="sub">{subtitle}</div>
            <AgentContext selected={selected} project={project} />
          </>
        )}
      </div>
      <Conversation file={file} project={project} />
    </>
  );
}

function Conversation({
  file,
  project,
}: {
  file: string | null;
  project: ProjectJson | undefined;
}) {
  const window = useTranscriptWindow(file);

  if (file === null) {
    return (
      <div id="conversation">
        <div id="placeholder">Select a session or subagent to view its conversation</div>
      </div>
    );
  }

  const failed = window.failed;

  return (
    <div id="conversation" ref={window.boxRef}>
      {/* 読み込みに失敗したことを、空の会話で表さない。遡りの失敗は「もっと前」の側で言う */}
      {(failed.initial || failed.older) && (
        <NotObserved {...conversationTrouble()} partial={failed.older} />
      )}
      {window.hasOlder && (
        <button type="button" id="older" onClick={window.loadOlder}>
          Load older
        </button>
      )}
      {window.events.map((entry) => (
        <EventView key={entry.key} event={entry.event} project={project} />
      ))}
      {/* 末尾の追いかけが返らなくなったことは、末尾に貼り付けて言う。**先頭に置くと誰も見ない** ——
          会話は末尾へ吸い付くので、伸びなくなったことに気付く人はそこを見ている。
          箱そのものは中身が無くても置く。読み上げる場所は、中身が入る前から在る必要がある。 */}
      <div className="conv-tail" role="status">
        {failed.follow && <NotObserved {...conversationTrouble()} partial />}
      </div>
    </div>
  );
}
