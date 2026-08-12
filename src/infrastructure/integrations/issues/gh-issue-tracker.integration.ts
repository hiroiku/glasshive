import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { UnexpectedError } from '~/app-kernel/error.ts';
import { type Observation, observed, unobservable } from '~/app-kernel/observation.ts';
import {
  type IssueBodyRequest,
  type IssueDiscussionRequest,
  type IssueEventsRequest,
  type IssuePageRequest,
  type IssueTrackerIntegration,
  TRACKER_DENIED,
  TRACKER_EXIT_NONZERO,
  TRACKER_NOT_INSTALLED,
  TRACKER_TIMEOUT,
} from '~/application/ports/integrations/issues/issue-tracker.integration.ts';
import { TrackerReadError } from '~/infrastructure/errors/issues/tracker-read.error.ts';

/* GitHub の課題を `gh` に尋ねる。読み取りだけで、何にも書き込まない。

   **トークンを自分で持たない。** 資格情報を扱うのは `gh` の仕事で、glasshive はそれを読みも
   書きもしない。こうしておくと「書くファイルは自分の `preferences.json` 1 つだけ」という
   約束が、GitHub を相手にしても崩れない。

   問い合わせは 1 本の GraphQL にまとめてある。依存も親子もラベルも、REST では課題 1 件ごとに
   別の呼び出しになり、100 件の一覧を出すのに数百回叩くことになる。

   落ちた理由はここで分ける。ここが errno の見える唯一の場所で、一度潰すと上の層では
   二度と分けられない。 */

const execFileAsync = promisify(execFile);

/** 応答を待つ上限。待ち続けると、課題の画面が開いたまま止まる */
const DEFAULT_TIMEOUT_MS = 15_000;

/** バッファの大きさ。一番大きいのはコメント 100 件ぶんのやり取りで、それでもこれに収まる */
const MAX_OUTPUT_BYTES = 8 * 1024 * 1024;

/* 課題 1 ページぶんの問い合わせ。

   **`blockedBy` は採るが `blocking` は採らない。** どちらも同じ依存を逆から見たもので、
   両方を並びに入れると依存の辺が二重に引かれる。向きは台帳と同じ「掛かっている先」に
   そろえてある。

   `issueDependenciesSummary` と `subIssuesSummary` は、**取ってきたページに依らない総数**を
   返す。採った数と突き合わせれば上限に当たったことが分かり、束の消化は一覧を絞っても
   分母が変わらない。

   入れ子の `first` を大きくしても値段は変わらない(実測。1 ページ 100 件で cost 4)ので、
   依存は 50 まで採る。上限そのものは残す — 際限なく求めると、1 件に数千の依存が付いた
   リポジトリで応答が返らなくなる。

   本文(`body`)は求めない。一覧に本文は要らず、100 件ぶんを運ぶと一覧そのものが開かなくなる。 */
const ISSUE_PAGE_QUERY = `
query($owner:String!,$name:String!,$pageSize:Int!,$cursor:String){
  repository(owner:$owner,name:$name){
    issues(first:$pageSize, after:$cursor, states:[OPEN,CLOSED], orderBy:{field:UPDATED_AT,direction:DESC}){
      pageInfo{ hasNextPage endCursor }
      nodes{
        number title state stateReason createdAt updatedAt closedAt url
        author{ login avatarUrl(size:48) }
        issueType{ name color }
        milestone{ title dueOn }
        comments{ totalCount }
        reactions{ totalCount }
        parent{ number }
        subIssuesSummary{ total completed }
        issueDependenciesSummary{ totalBlockedBy totalBlocking }
        labels(first:20){ nodes{ name color } }
        assignees(first:10){ nodes{ login avatarUrl(size:48) } }
        blockedBy(first:50){ nodes{ number state } }
        closedByPullRequestsReferences(first:10, includeClosedPrs:true){
          nodes{ number state isDraft reviewDecision headRefName }
        }
      }
    }
  }
}`;

/* 課題 1 件の本文。

   求めるのは `body` だけである。**一覧が持っている欄をここで採り直さない** —— 開いている
   パネルは既に一覧の 1 行を持っていて、同じものを 2 度運ぶと、どちらが新しいかを
   決める仕事が増える。ここが足すのは、一覧が持っていない本文だけ。

   `body` は書かれたままの Markdown である。`bodyHTML` は求めない —— こちらは Markdown を
   自分で描いていて、他所で組まれた HTML をこの画面に差し込むことはしない。 */
const ISSUE_BODY_QUERY = `
query($owner:String!,$name:String!,$number:Int!){
  repository(owner:$owner,name:$name){
    issue(number:$number){ body }
  }
}`;

/* 読むイベントの種類。**パネルと点で同じ一覧を使う。**

   ここが食い違うと、パネルが 8 件並べた課題の点が 5 つしか出ない。同じ課題に起きたことを
   2 か所で数えているのだから、数える対象は 1 か所に置く。

   絞らないと `timeline` には購読やラベルの色替えまで並び、1 ページの枠が画面に何も足さない
   項目で埋まる。 */
const ITEM_TYPES = [
  'ISSUE_COMMENT',
  'CLOSED_EVENT',
  'REOPENED_EVENT',
  'LABELED_EVENT',
  'UNLABELED_EVENT',
  'ASSIGNED_EVENT',
  'UNASSIGNED_EVENT',
  'MILESTONED_EVENT',
  'DEMILESTONED_EVENT',
  'CROSS_REFERENCED_EVENT',
  'MARKED_AS_DUPLICATE_EVENT',
  'PARENT_ISSUE_ADDED_EVENT',
  'BLOCKED_BY_ADDED_EVENT',
  'RENAMED_TITLE_EVENT',
].join(',');

/* 課題 1 件のやり取り 1 ページぶん。コメントと `timeline` のイベントを 1 本の並びで求める。

   欄の名前は introspection で確かめたものを使う。推測が当たらないものが幾つかある ——
   `BlockedByAddedEvent` は `blockingIssue`(`blockedByIssue` ではない)、
   `MarkedAsDuplicateEvent` は `canonical`、`MilestonedEvent` が返すのは `milestoneTitle` という
   文字列で、マイルストーンのオブジェクトではない。

   `totalCount` は求めない。GitHub の総数はこちらが読み飛ばす種類まで数えているので、
   持ち帰ると画面が `entries` の数と引き比べて、起きていない切り捨てを報せることになる。

   本文の HTML は求めない。一覧・本文と同じく、Markdown はこちらが描く。 */
const ISSUE_DISCUSSION_QUERY = `
query($owner:String!,$name:String!,$number:Int!,$cursor:String){
  repository(owner:$owner,name:$name){
    issue(number:$number){
      timelineItems(first:100, after:$cursor, itemTypes:[${ITEM_TYPES}]){
        pageInfo{ hasNextPage endCursor }
        nodes{
          __typename
          ... on IssueComment { createdAt author{login avatarUrl(size:48)} body }
          ... on ClosedEvent { createdAt actor{login avatarUrl(size:48)} stateReason }
          ... on ReopenedEvent { createdAt actor{login avatarUrl(size:48)} }
          ... on LabeledEvent { createdAt actor{login avatarUrl(size:48)} label{name color} }
          ... on UnlabeledEvent { createdAt actor{login avatarUrl(size:48)} label{name color} }
          ... on AssignedEvent { createdAt actor{login avatarUrl(size:48)} assignee{ ... on User { login avatarUrl(size:48) } } }
          ... on UnassignedEvent { createdAt actor{login avatarUrl(size:48)} assignee{ ... on User { login avatarUrl(size:48) } } }
          ... on MilestonedEvent { createdAt actor{login avatarUrl(size:48)} milestoneTitle }
          ... on DemilestonedEvent { createdAt actor{login avatarUrl(size:48)} milestoneTitle }
          ... on RenamedTitleEvent { createdAt actor{login avatarUrl(size:48)} previousTitle currentTitle }
          ... on ParentIssueAddedEvent { createdAt actor{login avatarUrl(size:48)} parent{number title} }
          ... on BlockedByAddedEvent { createdAt actor{login avatarUrl(size:48)} blockingIssue{number title} }
          ... on MarkedAsDuplicateEvent { createdAt actor{login avatarUrl(size:48)} canonical{ ... on Issue { number title } } }
          ... on CrossReferencedEvent {
            createdAt actor{login avatarUrl(size:48)} willCloseTarget
            source{ ... on PullRequest { number title } ... on Issue { number title } }
          }
        }
      }
    }
  }
}`;

/* 一覧に出ている課題に起きたこと 1 ページぶん。求めるのは時刻と種類だけである。

   **一覧の問い合わせと同じ並びで、同じ件数を求める。** `states` も `orderBy` も `first` も
   揃えてあるから、返る 100 件は一覧の 100 件と同じものになる。片方だけ変えると、一覧に出て
   いない課題の点を運ぶことになる。

   1 件あたり `last:30` にしてある。新しいほうから採るのは、両端 —— 作られた時刻と閉じた時刻
   —— が課題そのものの欄として別に届くからである。`cli/cli` の 100 件で測ると 2.3 秒・80 KB・
   rate limit の cost は 1 で、そのうち 6 件が 30 件を超えていた。超えたことは `totalCount` で
   分かるので、切ったことを画面まで持ち回る。 */
const ISSUE_EVENTS_QUERY = `
query($owner:String!,$name:String!,$pageSize:Int!,$cursor:String){
  repository(owner:$owner,name:$name){
    issues(first:$pageSize, after:$cursor, states:[OPEN,CLOSED], orderBy:{field:UPDATED_AT,direction:DESC}){
      pageInfo{ hasNextPage endCursor }
      nodes{
        number
        timelineItems(last:30, itemTypes:[${ITEM_TYPES}]){
          totalCount
          nodes{
            __typename
            ... on IssueComment { createdAt }
            ... on ClosedEvent { createdAt }
            ... on ReopenedEvent { createdAt }
            ... on LabeledEvent { createdAt }
            ... on UnlabeledEvent { createdAt }
            ... on AssignedEvent { createdAt }
            ... on UnassignedEvent { createdAt }
            ... on MilestonedEvent { createdAt }
            ... on DemilestonedEvent { createdAt }
            ... on RenamedTitleEvent { createdAt }
            ... on ParentIssueAddedEvent { createdAt }
            ... on BlockedByAddedEvent { createdAt }
            ... on MarkedAsDuplicateEvent { createdAt }
            ... on CrossReferencedEvent { createdAt }
          }
        }
      }
    }
  }
}`;

export interface GhRunOptions {
  readonly timeoutMs: number;
}

/** 起動の仕方。**落ちたら投げる。** 空文字に潰すと、上で理由を分けられなくなる */
export type GhRunner = (args: readonly string[], options: GhRunOptions) => Promise<string>;

export interface GhIssueTrackerOptions {
  /** テストで差し替える。既定は node:child_process の execFile を包んだもの */
  readonly run?: GhRunner;
  readonly timeoutMs?: number;
}

const runGh: GhRunner = async (args, { timeoutMs }) => {
  const { stdout } = await execFileAsync('gh', [...args], {
    encoding: 'utf8',
    timeout: timeoutMs,
    maxBuffer: MAX_OUTPUT_BYTES,
    /* 対話で尋ねさせない。`gh` は端末が在ると認証を促すことがあり、そうなるとこちらは
       答えの来ないまま待ち続ける。 */
    env: { ...process.env, GH_PROMPT_DISABLED: '1', GH_NO_UPDATE_NOTIFIER: '1' },
  });
  return stdout;
};

const propOf = (error: unknown, key: string): unknown =>
  typeof error === 'object' && error !== null ? (error as Record<string, unknown>)[key] : undefined;

const errnoOf = (error: unknown): string | undefined => {
  const code = propOf(error, 'code');
  return typeof code === 'string' ? code : undefined;
};

const exitCodeOf = (error: unknown): number | undefined => {
  const code = propOf(error, 'code');
  return typeof code === 'number' ? code : undefined;
};

const textOf = (value: unknown): string =>
  typeof value === 'string' ? value : Buffer.isBuffer(value) ? value.toString('utf8') : '';

/* 落ちた理由を分ける。

   `gh` は `git` と違って、どのディレクトリで起こしても同じものである。`ENOENT` の意味は
   1 つしかない — 入っていない。 */
function classifyFailure(
  error: unknown,
  request: IssuePageRequest | IssueBodyRequest | IssueDiscussionRequest | IssueEventsRequest,
): Observation<never> {
  const details = { repository: `${request.owner}/${request.name}` };
  const errno = errnoOf(error);

  if (errno === 'ENOENT') {
    return unobservable(
      new TrackerReadError('gh is not installed', TRACKER_NOT_INSTALLED, { cause: error, details }),
    );
  }
  if (errno === 'EACCES' || errno === 'EPERM') {
    return unobservable(
      new TrackerReadError('Not permitted to run gh', TRACKER_DENIED, { cause: error, details }),
    );
  }
  if (errno === 'ETIMEDOUT' || propOf(error, 'killed') === true) {
    return unobservable(
      new TrackerReadError('gh did not answer in time', TRACKER_TIMEOUT, { cause: error, details }),
    );
  }

  const status = exitCodeOf(error);
  if (status !== undefined) {
    return unobservable(
      new TrackerReadError('gh exited non-zero', TRACKER_EXIT_NONZERO, {
        cause: error,
        // 認証切れなのか、リポジトリが無いのかは、ここにしか残らない
        details: { ...details, status, stderr: textOf(propOf(error, 'stderr')) },
      }),
    );
  }

  /* 説明の付かない落ち方。**メッセージは自分で書く。** 投げられたエラーの `message` には
     `gh` が出した文字列がそのまま入っていて、それは外へ返す `message` に載る。証跡は
     `details` に置いて内側へ留める。 */
  return unobservable(
    new UnexpectedError('gh failed in a way we cannot explain', {
      cause: error,
      details: {
        ...details,
        errno,
        signal: propOf(error, 'signal'),
        stderr: textOf(propOf(error, 'stderr')),
      },
    }),
  );
}

export function createGhIssueTrackerIntegration(
  options?: GhIssueTrackerOptions,
): IssueTrackerIntegration {
  const run = options?.run ?? runGh;
  const timeoutMs = options?.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  return {
    async fetchIssuePage(request) {
      /* 値は `-F` で渡す。問い合わせの文字列に埋めると、リポジトリ名に引用符が混ざったときに
         GraphQL の構文が壊れる。`-F` は名前と値を分けて渡すので、何が来ても値のままである。 */
      const args = [
        'api',
        'graphql',
        '-f',
        `query=${ISSUE_PAGE_QUERY}`,
        '-F',
        `owner=${request.owner}`,
        '-F',
        `name=${request.name}`,
        '-F',
        `pageSize=${request.pageSize}`,
      ];
      /* 最初のページには続きの位置が無い。`cursor=` と空で渡すと `gh` は空文字列を送り、
         GitHub は「そこから先」を 0 件と答える。 */
      if (request.cursor !== null) args.push('-F', `cursor=${request.cursor}`);

      try {
        return observed(await run(args, { timeoutMs }));
      } catch (error) {
        return classifyFailure(error, request);
      }
    },

    async fetchIssueEvents(request) {
      const args = [
        'api',
        'graphql',
        '-f',
        `query=${ISSUE_EVENTS_QUERY}`,
        '-F',
        `owner=${request.owner}`,
        '-F',
        `name=${request.name}`,
        '-F',
        `pageSize=${request.pageSize}`,
      ];
      if (request.cursor !== null) args.push('-F', `cursor=${request.cursor}`);

      try {
        return observed(await run(args, { timeoutMs }));
      } catch (error) {
        return classifyFailure(error, request);
      }
    },

    async fetchIssueBody(request) {
      const args = [
        'api',
        'graphql',
        '-f',
        `query=${ISSUE_BODY_QUERY}`,
        '-F',
        `owner=${request.owner}`,
        '-F',
        `name=${request.name}`,
        '-F',
        `number=${request.number}`,
      ];

      try {
        return observed(await run(args, { timeoutMs }));
      } catch (error) {
        return classifyFailure(error, request);
      }
    },

    async fetchIssueDiscussion(request) {
      const args = [
        'api',
        'graphql',
        '-f',
        `query=${ISSUE_DISCUSSION_QUERY}`,
        '-F',
        `owner=${request.owner}`,
        '-F',
        `name=${request.name}`,
        '-F',
        `number=${request.number}`,
      ];
      /* 最初のページには続きの位置が無い。一覧と同じで、`cursor=` と空で渡すと `gh` は
         空文字列を送り、GitHub は「そこから先」を 0 件と答える。 */
      if (request.cursor !== null) args.push('-F', `cursor=${request.cursor}`);

      try {
        return observed(await run(args, { timeoutMs }));
      } catch (error) {
        return classifyFailure(error, request);
      }
    },
  };
}
