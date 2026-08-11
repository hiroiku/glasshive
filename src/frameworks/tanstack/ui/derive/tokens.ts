import type { GitOverviewJson } from '~/interface/presenters/git/git.presenter.ts';
import type { ProjectJson } from '~/interface/presenters/sessions/tree.presenter.ts';
import { worktreeName } from '../format.ts';

/* 文の中の語を、観測しているものと突き合わせるインデックス。純関数。

   会話や題名に出てくる `glasshive-2dt`・`mgr-a1b2c3d4`・`7f3473b` は、ただの文字列ではなく
   いま観測している何かを指している。観測したものの名前は片端からインデックスに入れる —
   セッションの id、子の id、課題、ブランチ、worktree、コミットの sha。そうしておけば、
   どの文のどこに同じ文字列が出ても同じチップになり、指す先が一つに定まる。

   **分からない語は触らない。** 手当たり次第にチップにすると、ふつうの単語が
   押せるものに見えて、押しても何も起きないチップが文中に散る。 */

export interface AgentRef {
  readonly file: string;
  readonly state: string;
}

/** 子の id に必ず付く頭。親を指す欄はこれを落とした素の id で書かれる */
const AGENT_PREFIX = 'agent-';

/** セッションの id を人が書き写すときの桁。Claude Code 自身がこの長さで見せる */
const SESSION_SHORT_CHARS = 8;

/** `transcript` のファイル名の末尾。文の中ではパスが丸ごと書かれる */
const TRANSCRIPT_SUFFIX = '.jsonl';

/* エージェントを特定できる語 → 会話のパス。

   **その 1 人を指せる文字列は、片端から入れる。** セッションは id・その頭 8 桁・
   `mgr-{頭 8 桁}`(`transcript` の本文にこの綴りで書かれることがある)で指される。子は
   ラベル・id・頭を落とした素の id・呼びかけに使う名前・生まれた `tool_use` の id で
   指される。どれで書かれても同じ会話へ行けるようにする。

   `transcript` のファイル名も入れる。パスが丸ごと書かれた文の中では、`/` で切った
   最後の一片がこれに当たる。 */
export function agentTokens(project: ProjectJson | undefined): Map<string, AgentRef> {
  const index = new Map<string, AgentRef>();
  const put = (key: string | null, file: string, state: string) => {
    // 先に見付けたものを残す。同じ名前が二度出たら、先のほうが親に近い
    if (key !== null && key !== '' && !index.has(key)) index.set(key, { file, state });
  };
  for (const session of project?.sessions ?? []) {
    put(session.id, session.file, session.state);
    put(session.id.slice(0, SESSION_SHORT_CHARS), session.file, session.state);
    put(`mgr-${session.id.slice(0, SESSION_SHORT_CHARS)}`, session.file, session.state);
    put(`${session.id}${TRANSCRIPT_SUFFIX}`, session.file, session.state);
    for (const subagent of session.subagents) {
      put(subagent.label, subagent.file, subagent.state);
      put(subagent.name, subagent.file, subagent.state);
      put(subagent.tool_use, subagent.file, subagent.state);
      put(subagent.id, subagent.file, subagent.state);
      put(`${subagent.id}${TRANSCRIPT_SUFFIX}`, subagent.file, subagent.state);
      /* 親を指す欄には頭が付いていない。素の id で書かれた語からも同じ子へ行けるようにする */
      if (subagent.id.startsWith(AGENT_PREFIX))
        put(subagent.id.slice(AGENT_PREFIX.length), subagent.file, subagent.state);
    }
  }
  return index;
}

/* 観測しているブランチと worktree の名前。

   居る者から拾うだけでは足りない。**誰も居ないブランチを文が指すことはある** —
   統合済みのブランチや、これから移る worktree がそれである。Git の観測が読めているなら、
   そちらの一覧も入れる。 */
export function gitTokens(
  project: ProjectJson | undefined,
  git?: GitOverviewJson | undefined,
): Map<string, 'branch' | 'worktree'> {
  const index = new Map<string, 'branch' | 'worktree'>();
  const put = (name: string | null | undefined, kind: 'branch' | 'worktree') => {
    if (name === null || name === undefined || name === '') return;
    /* `HEAD` はブランチの名前ではなく「いま居るところ」という git の言い方で、
       ブランチから離れて置かれた worktree はこの文字列を記録する。**指す先が無い。**
       チップにすると、コードの中の `HEAD` が軒並み押せるものに見える。 */
    if (name === 'HEAD') return;
    index.set(name, kind);
  };
  for (const branch of git?.branches ?? []) put(branch.name, 'branch');
  for (const worktree of git?.worktrees ?? []) {
    put(worktree.branch, 'branch');
    put(worktreeName(worktree.path), 'worktree');
  }
  for (const session of project?.sessions ?? []) {
    put(session.git_branch, 'branch');
    put(worktreeName(session.cwd), 'worktree');
    for (const subagent of session.subagents) {
      put(subagent.git_branch, 'branch');
      put(worktreeName(subagent.cwd), 'worktree');
    }
  }
  return index;
}

export interface CommitRef {
  /** Git に問い合わせるときのリビジョン。観測が返した表記のまま */
  readonly rev: string;
  /** 何をしたコミットか。ホバーしたときに出す。分からないものは空 */
  readonly subject: string;
}

/** 略記として引くのに最低限要る桁。git 自身がこの辺りから曖昧でなくなる */
const MIN_SHA_CHARS = 7;

/* 光らせるときに使う桁。**どの桁で書かれていても、いちばん短い頭で当てる。**

   画面の行が持つ sha は桁が揃っていない(ブランチは 7 桁、`mainline` は 10 桁)。突き合わせは
   部分一致なので、長い側から当てにいくと桁の短い行に届かない。皆が持っている
   最初の 7 桁なら、どの行にも当たる。 */
export const commitToken = (sha: string): string => sha.slice(0, MIN_SHA_CHARS);

/** 頭としてインデックスに並べる最長。これより長い略記を人は書かない */
const MAX_SHA_PREFIX_CHARS = 12;

const HEX = /^[0-9a-f]+$/;

/* コミットの sha のインデックス。**桁が揃っていないので、頭を並べて持つ。**

   Git の観測が返す sha は出所によって桁が違う(ブランチの先端は略記、`mainline` は 40 桁)。
   文に書かれるのも 7 桁だったり 40 桁だったりする。どちらから引いても同じコミットに
   当たるよう、7 桁から 12 桁までの頭をインデックスに並べておく。 */
export function commitTokens(git: GitOverviewJson | undefined): Map<string, CommitRef> {
  const index = new Map<string, CommitRef>();
  const put = (sha: string | null, subject: string) => {
    const lower = sha === null ? '' : sha.toLowerCase();
    if (lower.length < MIN_SHA_CHARS || !HEX.test(lower)) return;
    const ref: CommitRef = { rev: lower, subject };
    if (!index.has(lower)) index.set(lower, ref);
    const longest = Math.min(lower.length, MAX_SHA_PREFIX_CHARS);
    for (let n = MIN_SHA_CHARS; n <= longest; n += 1) {
      const head = lower.slice(0, n);
      if (!index.has(head)) index.set(head, ref);
    }
  };
  // 題を持っているものから先に入れる。同じコミットに二度当たったら、先のほうが饒舌である
  for (const node of git?.mainline ?? []) put(node.sha, node.subject);
  for (const branch of git?.branches ?? []) put(branch.sha, branch.subject);
  for (const tip of git?.tips ?? []) {
    put(tip.sha, tip.subject);
    put(tip.merge_base, '');
  }
  for (const worktree of git?.worktrees ?? []) put(worktree.sha, '');
  return index;
}

export interface IssueRef {
  readonly id: string;
  readonly closed: boolean;
}

/* 課題の id のインデックス。**書かれたとおりの id でしか引かない。**

   id は `#209` の形で、番号だけを鍵にすると文中のただの数がチップに化ける。

   閉じた課題もインデックスに入れる。コミットの題や Git が参照するのは、大半が統合済みの課題である。 */
export function issueIndex(
  issues: readonly { readonly id: string; readonly status: string }[],
): Map<string, IssueRef> {
  const index = new Map<string, IssueRef>();
  for (const issue of issues) {
    index.set(issue.id, { id: issue.id, closed: issue.status === 'closed' });
  }
  return index;
}

/** 語 1 つが指していたもの。押したときの行き先が種ごとに違う */
export type TokenHit =
  | { readonly kind: 'issue'; readonly id: string; readonly closed: boolean }
  | { readonly kind: 'agent'; readonly file: string; readonly state: string }
  | { readonly kind: 'ref'; readonly name: string; readonly ref: 'branch' | 'worktree' }
  | { readonly kind: 'commit'; readonly rev: string; readonly subject: string };

export interface TokenDict {
  /** どれも空か。空なら文をそのまま出せばよく、語ごとの突き合わせを丸ごと省ける */
  readonly empty: boolean;
  /** 語 1 つを引く。指す先が分からなければ `null` */
  lookup(word: string): TokenHit | null;
}

/* 四つのインデックスを、一つの `lookup` にまとめる。

   **名前の付いたものを先に見る。** 16 進の頭で当てるところだけは曖昧さを孕む — 子の id も
   16 進なので、先に当てると子が軒並みコミットに化ける。 */
export function tokenDict(
  issues: Map<string, IssueRef>,
  agents: Map<string, AgentRef>,
  gits: Map<string, 'branch' | 'worktree'>,
  commits: Map<string, CommitRef>,
): TokenDict {
  const commitOf = (word: string): CommitRef | undefined => {
    const lower = word.toLowerCase();
    if (lower.length < MIN_SHA_CHARS || !HEX.test(lower)) return undefined;
    const direct = commits.get(lower);
    if (direct !== undefined) return direct;
    // 文のほうがインデックスより長い桁で書いていることがある。長い頭から順に落として当てる
    for (let n = Math.min(lower.length, MAX_SHA_PREFIX_CHARS); n >= MIN_SHA_CHARS; n -= 1) {
      const hit = commits.get(lower.slice(0, n));
      if (hit !== undefined) return hit;
    }
    return undefined;
  };

  return {
    empty: issues.size === 0 && agents.size === 0 && gits.size === 0 && commits.size === 0,
    lookup(word) {
      const issue = issues.get(word);
      if (issue !== undefined) return { kind: 'issue', id: issue.id, closed: issue.closed };
      const agent = agents.get(word);
      if (agent !== undefined) return { kind: 'agent', file: agent.file, state: agent.state };
      const ref = gits.get(word);
      if (ref !== undefined) return { kind: 'ref', name: word, ref };
      const commit = commitOf(word);
      if (commit !== undefined) return { kind: 'commit', rev: commit.rev, subject: commit.subject };
      return null;
    },
  };
}
