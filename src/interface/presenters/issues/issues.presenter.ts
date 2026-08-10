import type { Observation } from '~/app-kernel/observation.ts';
import type { IssueRecord } from '~/application/use-cases/issues/get-issue.use-case.ts';
import type {
  GithubActor,
  GithubIssueExtra,
} from '~/application/use-cases/issues/list-github-issues.use-case.ts';
import type {
  IssueLedger,
  IssueSummary,
} from '~/application/use-cases/issues/list-issues.use-case.ts';
import type { ObservationState } from '~/interface/presenters/sessions/tree.presenter.ts';

/* 課題の観測を、外部 API が読む形へ写す。

   見るのは呼び出しの出力だけである。内側がどんな形で課題を持っているかは、ここへは届かない。

   snake_case の名前はここだけが知っている。内側は camelCase のまま、外の都合を何も知らない。

   **空の一覧を、そのまま空の一覧として返さない。** 台帳が無いプロジェクト・課題が 1 件も
   無いプロジェクト・台帳を読めなかったプロジェクトは、どれも `issues: []` になる。
   `state` を添えて初めて見分けが付く。 */

export interface IssueDependencyJson {
  on: string | null;
  type: string | null;
}

export interface GithubLabelJson {
  name: string;
  /** `#` の付かない 6 桁。GitHub が付けた色をそのまま運ぶ */
  color: string | null;
}

/* 人 1 人。**GitHub の顔の URL そのものは外へ出さない。**

   出せば画面が GitHub の CDN へ直に取りに行き、機械から外へつながる先が 2 か所になる。
   外へ渡すのは `avatar` —— こちらが読んだ顔を指す、同じ origin の URL を組む鍵である。 */
export interface GithubActorJson {
  login: string;
  /** 同じ origin のアバターの URL を組む鍵。読める顔が無ければ `null` */
  avatar: string | null;
}

export interface GithubPullRequestJson {
  number: number;
  state: string;
  is_draft: boolean;
  review_decision: string | null;
  /** PR が乗っているブランチ。セッションの `git_branch` と突き合わせる鍵 */
  head_ref_name: string | null;
}

export interface GithubIssueJson {
  url: string | null;
  labels: GithubLabelJson[];
  assignees: GithubActorJson[];
  author: GithubActorJson | null;
  milestone: { title: string; due_on: string | null } | null;
  issue_type_color: string | null;
  sub_issues: { total: number; completed: number } | null;
  pull_requests: GithubPullRequestJson[];
  comments: number;
  reactions: number;
}

/** 一覧の 1 件。`description` は入らない — 本文は 1 件を引いたときだけ返る */
export interface IssueSummaryJson {
  id: string | null;
  title: string | null;
  status: string;
  priority: number | null;
  issue_type: string | null;
  labels: string[] | null;
  assignee: string | null;
  owner: string | null;
  created_at: string | null;
  updated_at: string | null;
  deps: IssueDependencyJson[];
  /** 掛かっている先を全部見られたか。欠けたまま「これが全部だ」と描かせないための欄 */
  deps_complete: boolean;
  /** GitHub にしか無い欄。台帳から読んだ課題では `null` */
  github: GithubIssueJson | null;
}

export interface IssuesJson {
  state: ObservationState;
  /** 観測できなかった理由。観測できたときは理由が無いので `null` */
  reason: string | null;
  issues: IssueSummaryJson[];
  /** 状態ごとの件数。一覧から落とした閉じた課題も、ここには出る */
  counts: Record<string, number>;
  /** 上限に当たって、その先を読んでいないか。読めなかったときは、切れた先が在るとは言えないので `false` */
  truncated: boolean;
}

/* 台帳から出てきた値。**JSON でしかありえない。**

   台帳は 1 行 1 記録の JSON なので、パースした結果に JSON でない値は入らない。
   内側は `unknown` のまま持っている(何の欄が来るか知らないので当然である)が、
   外へ出す形を決めるのはここなので、ここで JSON だと言い切る。 */
export type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

export interface IssueJson {
  state: ObservationState;
  reason: string | null;
  /** 台帳に書かれていた欄をそのまま。bd の書き出しが既に外の名前で書かれている */
  issue: Record<string, JsonValue> | null;
}

/** 理由を 1 つの文字列で返す。`absent` なら何が無いのか、`unobservable` ならエラーコード */
const reasonOf = <T>(observation: Observation<T>): string | null => {
  if (observation.kind === 'absent') return observation.reason;
  if (observation.kind === 'unobservable') return observation.error.code;
  return null;
};

/* 人 1 人を外の形にする。

   **GitHub の顔の URL は落とす。** 代わりに載せるのは `avatar` —— アバターの URL を組む鍵で、
   実体は login である。読める顔が無ければ `null` で、そのときは頭文字だけを描かせる。
   GitHub の URL をそのまま渡すと、画面が CDN へ直に取りに行く。 */
const presentActor = (actor: GithubActor): GithubActorJson => ({
  login: actor.login,
  avatar: actor.avatarUrl === null ? null : actor.login,
});

const presentGithub = (extra: GithubIssueExtra): GithubIssueJson => ({
  url: extra.url,
  labels: extra.labels.map((label) => ({ name: label.name, color: label.color })),
  assignees: extra.assignees.map(presentActor),
  author: extra.author === null ? null : presentActor(extra.author),
  milestone:
    extra.milestone === null
      ? null
      : { title: extra.milestone.title, due_on: extra.milestone.dueOn },
  issue_type_color: extra.issueTypeColor,
  sub_issues:
    extra.subIssues === null
      ? null
      : { total: extra.subIssues.total, completed: extra.subIssues.completed },
  pull_requests: extra.pullRequests.map((pull) => ({
    number: pull.number,
    state: pull.state,
    is_draft: pull.isDraft,
    review_decision: pull.reviewDecision,
    head_ref_name: pull.headRefName,
  })),
  comments: extra.comments,
  reactions: extra.reactions,
});

const presentSummary = (issue: IssueSummary): IssueSummaryJson => ({
  id: issue.id,
  title: issue.title,
  status: issue.status,
  priority: issue.priority,
  issue_type: issue.issueType,
  labels: issue.labels === null ? null : [...issue.labels],
  assignee: issue.assignee,
  owner: issue.owner,
  created_at: issue.createdAt,
  updated_at: issue.updatedAt,
  deps: issue.deps.map((dependency) => ({
    on: dependency.on,
    type: dependency.type,
  })),
  deps_complete: issue.depsComplete,
  github: issue.github === null ? null : presentGithub(issue.github),
});

/* 観測できなかったときも、この形で言える。

   API の側は `unobservable` を 503 へ写す(`api-error.presenter.ts` の `ledger.unreadable`)ので、
   ふつうここへは `observed` と `absent` しか来ない。それでも三つとも写せるようにしてあるのは、
   読めなかった台帳をうっかり「課題が 1 件も無いプロジェクト」として出さないためである。 */
export function presentIssues(ledger: Observation<IssueLedger>): IssuesJson {
  return {
    state: ledger.kind,
    reason: reasonOf(ledger),
    issues: ledger.kind === 'observed' ? ledger.value.issues.map(presentSummary) : [],
    counts: ledger.kind === 'observed' ? { ...ledger.value.counts } : {},
    truncated: ledger.kind === 'observed' && ledger.value.truncated,
  };
}

export function presentIssue(record: Observation<IssueRecord>): IssueJson {
  return {
    state: record.kind,
    reason: reasonOf(record),
    /* 台帳の 1 行をパースしたものなので、中身は JSON である。
       欄ごとに確かめないのは、確かめても直しようが無いからである — 何の欄が来るかを
       決めているのは bd であって、こちらではない。 */
    issue: record.kind === 'observed' ? (record.value as Record<string, JsonValue>) : null,
  };
}
