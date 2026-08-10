import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { UnexpectedError } from '~/app-kernel/error.ts';
import { type Observation, observed, unobservable } from '~/app-kernel/observation.ts';
import {
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

/** バッファの大きさ。1 ページ 100 件に本文は含めないので、これで足りる */
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
        number title state stateReason createdAt updatedAt url
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
function classifyFailure(error: unknown, request: IssuePageRequest): Observation<never> {
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
  };
}
