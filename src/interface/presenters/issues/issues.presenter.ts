import type { Observation } from '~/app-kernel/observation.ts';
import type { IssueRecord } from '~/application/use-cases/issues/get-issue.use-case.ts';
import type {
  IssueLedger,
  IssueSummary,
} from '~/application/use-cases/issues/list-issues.use-case.ts';
import type { ObservationState } from '~/interface/presenters/sessions/tree.presenter.ts';

/* 課題の観測を、外の道が読む形へ写す。

   見るのは求めの出力だけである。内側がどんな形で課題を持っているかは、ここへは届かない。

   snake_case の名前はここだけが知っている。内側は camelCase のまま、外の都合を何も知らない。

   **空の一覧を、そのまま空の一覧として返さない。** 台帳が無い巣・課題が 1 件も無い巣・
   台帳を読めなかった巣は、どれも `issues: []` になる。`state` を添えて初めて見分けが付く。 */

export interface IssueDependencyJson {
  on: string | null;
  type: string | null;
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
}

export interface IssuesJson {
  state: ObservationState;
  /** 見えなかった言い分。見えたときは理由が無いので `null` */
  reason: string | null;
  issues: IssueSummaryJson[];
  /** 状態ごとの件数。一覧から落とした閉じた課題も、ここには出る */
  counts: Record<string, number>;
}

/* 台帳から出てきた値。**JSON でしかありえない。**

   台帳は 1 行 1 記録の JSON なので、読み解いた結果に JSON でない値は入らない。
   内側は `unknown` のまま持っている(何の欄が来るか知らないので当然である)が、
   外へ出す道はここなので、ここで JSON だと言い切る。 */
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

/** 見えなかった理由の名札。無いなら何が無いのか、読めなかったならどの誤りか */
const reasonOf = <T>(observation: Observation<T>): string | null => {
  if (observation.kind === 'absent') return observation.reason;
  if (observation.kind === 'unobservable') return observation.error.code;
  return null;
};

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
});

/* 見に行けなかったときも、この形で言える。

   道の側は `unobservable` を 503 へ写す(`api-error.presenter.ts` の `ledger.unreadable`)ので、
   ふつうここへは `observed` と `absent` しか来ない。それでも三つとも写せるようにしてあるのは、
   読めなかった台帳をうっかり「課題が 1 件も無い巣」として出さないためである。 */
export function presentIssues(ledger: Observation<IssueLedger>): IssuesJson {
  return {
    state: ledger.kind,
    reason: reasonOf(ledger),
    issues: ledger.kind === 'observed' ? ledger.value.issues.map(presentSummary) : [],
    counts: ledger.kind === 'observed' ? { ...ledger.value.counts } : {},
  };
}

export function presentIssue(record: Observation<IssueRecord>): IssueJson {
  return {
    state: record.kind,
    reason: reasonOf(record),
    /* 台帳の 1 行を読み解いたものなので、中身は JSON である。
       欄ごとに確かめないのは、確かめても直しようが無いからである — 何の欄が来るかを
       決めているのは bd であって、こちらではない。 */
    issue: record.kind === 'observed' ? (record.value as Record<string, JsonValue>) : null,
  };
}
