import type { ProjectJson } from '~/interface/presenters/sessions/tree.presenter.ts';
import { worktreeName } from '../format.ts';

/* 文の中の語を、観測しているものと突き合わせる索き。**純関数。**

   会話や題名に出てくる `glasshive-2dt` や `mgr-a1b2c3d4` は、ただの字ではなく
   いま観ている何かを指している。指しているものが分かる語だけを札に変える。

   **分からない語は触らない。** 手当たり次第に札にすると、ふつうの単語が
   押せるものに見えて、押しても何も起きない札が文中に散る。 */

export interface AgentRef {
  readonly file: string;
  readonly state: string;
}

/* エージェントを特定できる語 → 会話の在り処。

   材料は 3 つ。正本に書かれた actor の名、子の呼び名、そして `mgr-{セッション id の先頭 8 桁}`
   という命名の決め事(bd の書き込み手はこの名で記録される)。 */
export function agentTokens(project: ProjectJson | undefined): Map<string, AgentRef> {
  const index = new Map<string, AgentRef>();
  const put = (key: string | null, file: string, state: string) => {
    // 先に見付けたものを残す。同じ名前が二度出たら、先のほうが親に近い
    if (key !== null && key !== '' && !index.has(key)) index.set(key, { file, state });
  };
  for (const session of project?.sessions ?? []) {
    put(session.actor, session.file, session.state);
    put(`mgr-${session.id.slice(0, 8)}`, session.file, session.state);
    for (const subagent of session.subagents) {
      put(subagent.label, subagent.file, subagent.state);
    }
  }
  return index;
}

/** 観測している枝と作業場所の名前。文中の語を札にする材料 */
export function gitTokens(project: ProjectJson | undefined): Map<string, 'branch' | 'worktree'> {
  const index = new Map<string, 'branch' | 'worktree'>();
  const put = (branch: string | null, cwd: string | null) => {
    if (branch !== null && branch !== '') index.set(branch, 'branch');
    const worktree = worktreeName(cwd);
    if (worktree !== '') index.set(worktree, 'worktree');
  };
  for (const session of project?.sessions ?? []) {
    put(session.git_branch, session.cwd);
    for (const subagent of session.subagents) put(subagent.git_branch, subagent.cwd);
  }
  return index;
}

export interface IssueRef {
  readonly id: string;
  readonly closed: boolean;
}

/** 略記として引くのに最低限要る長さ。これより短いと、ふつうの語に当たる */
const MIN_SHORT_ID_CHARS = 4;

/** 共通の頭として認めるのに最低限要る長さ */
const MIN_PREFIX_CHARS = 3;

/* 課題の id の索き。正式な id に加え、**共通の頭を見付けて略記からも引けるようにする。**

   会話では `kuden-os-4f2a` が `4f2a` と略される。台帳の全部の id に共通する頭を求め、
   区切りまで戻したものを頭と見なす。

   閉じた課題も索きに入れる。コミットの題や記録が参照するのは、大半が統合済みの課題である。 */
export function issueIndex(
  issues: readonly { readonly id: string | null; readonly status: string }[],
): Map<string, IssueRef> {
  const index = new Map<string, IssueRef>();
  const ids: string[] = [];
  for (const issue of issues) {
    if (issue.id === null || issue.id === '') continue;
    ids.push(issue.id);
    index.set(issue.id, { id: issue.id, closed: issue.status === 'closed' });
  }
  if (ids.length < 2) return index;

  let common = ids[0] ?? '';
  for (const id of ids) {
    while (common !== '' && !id.startsWith(common)) common = common.slice(0, -1);
  }
  const cut = common.lastIndexOf('-');
  const prefix = cut > 0 ? common.slice(0, cut + 1) : '';
  if (prefix.length < MIN_PREFIX_CHARS) return index;

  for (const id of ids) {
    const short = id.slice(prefix.length);
    if (short.length < MIN_SHORT_ID_CHARS || index.has(short)) continue;
    const full = index.get(id);
    if (full !== undefined) index.set(short, full);
  }
  return index;
}
