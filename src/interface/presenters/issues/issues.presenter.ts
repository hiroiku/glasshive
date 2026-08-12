import type { Observation } from '~/app-kernel/observation.ts';
import type {
  GithubIssueDiscussion,
  GithubIssueDiscussionEntry,
  GithubIssueReference,
} from '~/application/use-cases/issues/get-github-issue-discussion.use-case.ts';
import type {
  GithubIssueEventLog,
  GithubIssueEvents,
} from '~/application/use-cases/issues/list-github-issue-events.use-case.ts';
import type {
  GithubActor,
  GithubIssueExtra,
  IssueLedger,
  IssueListing,
  IssueListingHead,
  IssueSummary,
} from '~/application/use-cases/issues/list-github-issues.use-case.ts';
import type { ObservationState } from '~/interface/presenters/sessions/tree.presenter.ts';

/* 課題の観測を、外部 API が読む形へ写す。

   見るのは呼び出しの出力だけである。内側がどんな形で課題を持っているかは、ここへは届かない。

   snake_case の名前はここだけが知っている。内側は camelCase のまま、外の都合を何も知らない。

   **空の一覧を、そのまま空の一覧として返さない。** GitHub の remote が無いプロジェクト・
   課題が 1 件も無いプロジェクト・`gh` が答えなかったプロジェクトは、どれも `issues: []` に
   なる。`state` を添えて初めて見分けが付く。 */

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
  /** `#<番号>` の形。番号を読めなかった課題は一覧に入らないので、必ず在る */
  id: string;
  title: string | null;
  /** `open` / `blocked` / `closed` / `not_planned` のどれか。画面の色分けと並び順はこれで決まる */
  status: string;
  issue_type: string | null;
  labels: string[] | null;
  /** 担当は先頭の 1 人だけ。全員が要るときは `github.assignees` を読む */
  assignee: string | null;
  created_at: string | null;
  updated_at: string | null;
  /** 閉じた時刻。開いている課題には無い。`updated_at` とは別のものである */
  closed_at: string | null;
  deps: IssueDependencyJson[];
  /** 掛かっている先を全部見られたか。欠けたまま「これが全部だ」と描かせないための欄 */
  deps_complete: boolean;
  /** `IssueSummaryJson` の欄に写す先が無かった、GitHub にしか無いものをまとめたもの */
  github: GithubIssueJson;
}

/** 課題 1 件に起きたこと 1 つ。時刻と種類だけを運ぶ */
export interface GithubIssueEventJson {
  at: string;
  /** `comment` / `closed` / `labeled` など。やり取りの `kind` と同じ言葉 */
  kind: string;
}

/** 課題 1 件ぶん */
export interface GithubIssueEventsJson {
  /** `#<番号>` の形。一覧の行と突き合わせる鍵 */
  id: string;
  events: GithubIssueEventJson[];
  /** 1 件あたりの上限に当たって、その先を読んでいないか */
  truncated: boolean;
}

/* 一覧ぶんのイベント。

   `issues` を空にするのは `observed` でなかったときだけで、そのときは `state` と `reason` が
   なぜ空なのかを言う。**空の並びだけを返してはいけない** —— 何も起きていない一覧と、
   `gh` が答えなかった一覧が同じ画面になる。 */
export interface GithubIssueEventLogJson {
  state: ObservationState;
  reason: string | null;
  issues: GithubIssueEventsJson[];
  /** 一覧の課題を全部辿れたか。読めなかったときは `false` */
  complete: boolean;
  /* 歩き終えたか。**`complete` とは別のものである** —— あちらは「歩いて、そこまでしか
     辿れなかった」で、こちらは「まだページが届いている途中」である。混ぜると、届く前の行が
     読みに行って読めなかった行として画面に出る。 */
  walked: boolean;
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
  /** 課題を尋ねた先。`owner/name` の形。尋ねられなかったときは `null` */
  repository: string | null;
  /** 尋ねなかった GitHub のリポジトリの数。glasshive が選んでいなければ `0` */
  other_repositories: number;
  /* 歩き終えたか。**`truncated` とは別のものである** —— あちらは「上限に当たって、その先を
     読んでいない」で、こちらは「まだページが届いている途中」である。

     読んでいる最中かどうかを問い合わせの `isFetching` から採ってはいけない。取り直しの間は
     前の答えを出したままにしてあるので、**読み終えた一覧の上で `isFetching` が真になる。** */
  walked: boolean;
}

/* ストリームに流れる 1 つ。

   **`head` が必ず先に来る。** そこに `state` と尋ね先が入っているので、後から届くページは
   行を足すだけになり、どこの課題を見ているのかは 1 件目より先に決まっている。観測が
   成り立たなかったときは、その 1 枚だけで終わる。

   `page` が運ぶのはそのページぶんだけである。`counts` も同じで、足し合わせるのは受け取る側の
   仕事になる —— 積み上げたものを配ると、同じ課題を 5 回運ぶことになる。 */
export type IssuesChunkJson =
  | { kind: 'head'; head: IssuesJson }
  | { kind: 'page'; issues: IssueSummaryJson[]; counts: Record<string, number> }
  | { kind: 'complete'; truncated: boolean };

/* GitHub の課題 1 件の本文。**空の本文と、読めなかったことを分けて運ぶ。**
   `body: ''` を `null` と同じ形で返すと、本文の無い課題が読めなかった課題に見える。 */
export interface GithubIssueBodyJson {
  state: ObservationState;
  reason: string | null;
  /** 書かれたままの Markdown。読めなかった・その番号が無かったときは `null` */
  body: string | null;
}

/** やり取りが名指す課題や PR */
export interface GithubIssueReferenceJson {
  number: number;
  title: string | null;
}

/** どのイベントも持つもの */
interface DiscussionEntryBaseJson {
  /** GitHub の `createdAt` をそのまま運ぶ ISO 8601 の文字列 */
  at: string;
  /* 起こした人。**顔を引けないことと、誰も名指されていないことは別である** —— 前者は
     `actor.avatar` が `null` で、後者はこの欄そのものが `null` になる。 */
  actor: GithubActorJson | null;
}

/* やり取りの 1 項目。**内側と同じ直和のまま外へ出す。**

   共通の欄だけを持つ 1 つの型に潰すと、どのイベントが何を持っているかが型から消えて、
   受け取る側が毎回 `null` 検査をすることになる。

   `kind` の綴りは内側のものをそのまま運ぶ。snake_case にするのは欄の名前だけで、値は
   `status` の `not_planned` と同じく、決めた場所の綴りで外まで届く。 */
export type GithubIssueDiscussionEntryJson =
  | (DiscussionEntryBaseJson & {
      kind: 'comment';
      /** 書かれたままの Markdown。空文字列は本文の無いコメント、`null` は本文を読めなかったこと */
      body: string | null;
    })
  | (DiscussionEntryBaseJson & { kind: 'closed'; reason: string | null })
  | (DiscussionEntryBaseJson & { kind: 'reopened' })
  | (DiscussionEntryBaseJson & { kind: 'labeled'; label: GithubLabelJson })
  | (DiscussionEntryBaseJson & { kind: 'unlabeled'; label: GithubLabelJson })
  | (DiscussionEntryBaseJson & { kind: 'assigned'; assignee: GithubActorJson | null })
  | (DiscussionEntryBaseJson & { kind: 'unassigned'; assignee: GithubActorJson | null })
  | (DiscussionEntryBaseJson & { kind: 'milestoned'; milestone_title: string | null })
  | (DiscussionEntryBaseJson & { kind: 'demilestoned'; milestone_title: string | null })
  | (DiscussionEntryBaseJson & {
      kind: 'renamed';
      previous_title: string | null;
      current_title: string | null;
    })
  | (DiscussionEntryBaseJson & { kind: 'parent-added'; parent: GithubIssueReferenceJson })
  | (DiscussionEntryBaseJson & {
      kind: 'blocked-by-added';
      blocking_issue: GithubIssueReferenceJson;
    })
  | (DiscussionEntryBaseJson & {
      kind: 'marked-as-duplicate';
      canonical: GithubIssueReferenceJson;
    })
  | (DiscussionEntryBaseJson & {
      kind: 'cross-referenced';
      source: GithubIssueReferenceJson;
      /** その PR がマージされたら、この課題が閉じるか */
      will_close_target: boolean;
    });

/* GitHub の課題 1 件のやり取り。**何も言われていないことと、読めなかったことを分けて運ぶ。**
   `entries: []` だけを返すと、誰も何も書いていない課題が読めなかった課題に見える。 */
export interface GithubIssueDiscussionJson {
  state: ObservationState;
  reason: string | null;
  /** GitHub が返した順のまま。読めなかったときは空 */
  entries: GithubIssueDiscussionEntryJson[];
  /** 上限に当たって、その先を読んでいないか。読めなかったときは `false` */
  truncated: boolean;
  /* 歩き終えたか。**`truncated` とは別のものである** —— あちらは「上限に当たって、その先を
     読んでいない」で、こちらは「まだページが届いている途中」である。ここが無いと、1 件目が
     届く前の画面が「まだ誰も書いていない課題」として読める。 */
  walked: boolean;
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
  issue_type: issue.issueType,
  labels: issue.labels === null ? null : [...issue.labels],
  assignee: issue.assignee,
  created_at: issue.createdAt,
  updated_at: issue.updatedAt,
  closed_at: issue.closedAt,
  deps: issue.deps.map((dependency) => ({
    on: dependency.on,
    type: dependency.type,
  })),
  deps_complete: issue.depsComplete,
  github: presentGithub(issue.github),
});

/* 観測できなかったときも、この形で言える。

   API の側は `unobservable` を 503 へ写す(`api-error.presenter.ts` の `tracker.*`)ので、
   ふつうここへは `observed` と `absent` しか来ない。それでも三つとも写せるようにしてあるのは、
   `gh` が答えなかったプロジェクトを、うっかり「課題が 1 件も無いプロジェクト」として
   出さないためである。 */
export function presentIssues(observation: Observation<IssueListing>): IssuesJson {
  const listing = observation.kind === 'observed' ? observation.value : null;
  return {
    state: observation.kind,
    reason: reasonOf(observation),
    issues: listing === null ? [] : listing.ledger.issues.map(presentSummary),
    counts: listing === null ? {} : { ...listing.ledger.counts },
    truncated: listing?.ledger.truncated ?? false,
    // 1 枚で返す経路は、返した時点で歩き終えている
    walked: true,
    repository:
      listing === null
        ? null
        : `${listing.source.repository.owner}/${listing.source.repository.name}`,
    other_repositories: listing?.source.others ?? 0,
  };
}

/* 一覧の最初の 1 枚。**行はまだ 1 つも無い。**

   `truncated` はここでは `false` である。上限に当たったかどうかが分かるのは読み終えたときで、
   読み始めに `true` を置くと、切れた先が在るとまだ言えないうちから言うことになる。 */
export function presentIssuesHead(observation: Observation<IssueListingHead>): IssuesJson {
  const head = observation.kind === 'observed' ? observation.value : null;
  return {
    state: observation.kind,
    reason: reasonOf(observation),
    issues: [],
    counts: {},
    truncated: false,
    walked: false,
    repository:
      head === null ? null : `${head.source.repository.owner}/${head.source.repository.name}`,
    other_repositories: head?.source.others ?? 0,
  };
}

/** ページ 1 つぶん。件数も、そのページに在ったぶんだけ */
export function presentIssuePage(ledger: IssueLedger): {
  issues: IssueSummaryJson[];
  counts: Record<string, number>;
} {
  return { issues: ledger.issues.map(presentSummary), counts: { ...ledger.counts } };
}

export function presentGithubIssueBody(body: Observation<string>): GithubIssueBodyJson {
  return {
    state: body.kind,
    reason: reasonOf(body),
    body: body.kind === 'observed' ? body.value : null,
  };
}

const presentReference = (reference: GithubIssueReference): GithubIssueReferenceJson => ({
  number: reference.number,
  title: reference.title,
});

/* やり取りの 1 項目を外の形にする。

   **種類を網羅した `switch` にする。** `default` でまとめて写すと、名前の違う欄を持つ種類が
   欄の抜けたまま外へ出る。ここで写し損ねたものは、画面には最初から無かったことになる。 */
function presentDiscussionEntry(entry: GithubIssueDiscussionEntry): GithubIssueDiscussionEntryJson {
  const base = {
    at: entry.at,
    actor: entry.actor === null ? null : presentActor(entry.actor),
  };
  switch (entry.kind) {
    case 'comment':
      return { ...base, kind: 'comment', body: entry.body };
    case 'closed':
      return { ...base, kind: 'closed', reason: entry.reason };
    case 'reopened':
      return { ...base, kind: 'reopened' };
    case 'labeled':
      return { ...base, kind: 'labeled', label: { ...entry.label } };
    case 'unlabeled':
      return { ...base, kind: 'unlabeled', label: { ...entry.label } };
    case 'assigned':
      return {
        ...base,
        kind: 'assigned',
        assignee: entry.assignee === null ? null : presentActor(entry.assignee),
      };
    case 'unassigned':
      return {
        ...base,
        kind: 'unassigned',
        assignee: entry.assignee === null ? null : presentActor(entry.assignee),
      };
    case 'milestoned':
      return { ...base, kind: 'milestoned', milestone_title: entry.milestoneTitle };
    case 'demilestoned':
      return { ...base, kind: 'demilestoned', milestone_title: entry.milestoneTitle };
    case 'renamed':
      return {
        ...base,
        kind: 'renamed',
        previous_title: entry.previousTitle,
        current_title: entry.currentTitle,
      };
    case 'parent-added':
      return { ...base, kind: 'parent-added', parent: presentReference(entry.parent) };
    case 'blocked-by-added':
      return {
        ...base,
        kind: 'blocked-by-added',
        blocking_issue: presentReference(entry.blockingIssue),
      };
    case 'marked-as-duplicate':
      return {
        ...base,
        kind: 'marked-as-duplicate',
        canonical: presentReference(entry.canonical),
      };
    case 'cross-referenced':
      return {
        ...base,
        kind: 'cross-referenced',
        source: presentReference(entry.source),
        will_close_target: entry.willCloseTarget,
      };
  }
}

/* 一覧ぶんのイベントを外の形にする。中身は写すだけで、順序も切られたことも触らない */
export function presentGithubIssueEvents(
  log: Observation<GithubIssueEventLog>,
): GithubIssueEventLogJson {
  return {
    state: log.kind,
    reason: reasonOf(log),
    issues: log.kind === 'observed' ? presentGithubIssueEventsPage(log.value.issues) : [],
    complete: log.kind === 'observed' && log.value.complete,
    // 1 枚で返す経路は、返した時点で歩き終えている
    walked: true,
  };
}

/* ストリームに流れる 1 つ。一覧と同じ形である。

   `complete` を決めるのは最後の 1 つだけである。**読んでいる途中を `complete: false` で
   表さない** —— まだ届いていない行が「読みに行って辿れなかった行」として画面に出る。 */
export type GithubIssueEventsChunkJson =
  | { kind: 'head'; head: GithubIssueEventLogJson }
  | { kind: 'page'; issues: GithubIssueEventsJson[] }
  | { kind: 'complete'; complete: boolean };

/* 記録の最初の 1 枚。**行はまだ 1 つも無い。**

   `complete` は `false` である。全部を辿れたかどうかが分かるのは読み終えたときで、
   読み始めに `true` を置くと、辿れていない先が無いとまだ言えないうちから言うことになる。 */
export function presentGithubIssueEventsHead(head: Observation<null>): GithubIssueEventLogJson {
  return { state: head.kind, reason: reasonOf(head), issues: [], complete: false, walked: false };
}

/** ページ 1 つぶん。中身は写すだけで、順序も切られたことも触らない */
export const presentGithubIssueEventsPage = (
  issues: readonly GithubIssueEvents[],
): GithubIssueEventsJson[] =>
  issues.map((issue) => ({
    id: issue.id,
    events: issue.events.map((event) => ({ at: event.at, kind: event.kind })),
    truncated: issue.truncated,
  }));

/* 観測できなかったときも、この形で言える。

   `entries` を空にするのは `observed` でなかったときだけで、そのときは `state` と `reason` が
   なぜ空なのかを言う。**空の並びだけを返してはいけない** —— 誰も何も言っていない課題と、
   `gh` が答えなかった課題が同じ画面になる。 */
export function presentGithubIssueDiscussion(
  discussion: Observation<GithubIssueDiscussion>,
): GithubIssueDiscussionJson {
  return {
    state: discussion.kind,
    reason: reasonOf(discussion),
    entries:
      discussion.kind === 'observed' ? discussion.value.entries.map(presentDiscussionEntry) : [],
    truncated: discussion.kind === 'observed' && discussion.value.truncated,
    // 1 枚で返す経路は、返した時点で歩き終えている
    walked: true,
  };
}

/* やり取りをページごとに配るときの形。一覧と同じく、最初の 1 枚が観測の成否を運ぶ */
export type GithubIssueDiscussionChunkJson =
  | { kind: 'head'; head: GithubIssueDiscussionJson }
  | { kind: 'page'; entries: GithubIssueDiscussionEntryJson[] }
  | { kind: 'complete'; truncated: boolean };

/* 最初の 1 枚。**行はまだ 1 つも無い。** ここで `walked` を立てないのは、立てると
   1 件目が届く前の画面が「まだ誰も書いていない課題」として出るからである。 */
export function presentGithubIssueDiscussionHead(
  head: Observation<null>,
): GithubIssueDiscussionJson {
  return {
    state: head.kind,
    reason: reasonOf(head),
    entries: [],
    truncated: false,
    walked: false,
  };
}

/** ページ 1 つぶんのやり取り。前のページを含まないので、畳む側が積み上げる */
export function presentGithubIssueDiscussionPage(
  entries: readonly GithubIssueDiscussionEntry[],
): GithubIssueDiscussionEntryJson[] {
  return entries.map(presentDiscussionEntry);
}
