import { asArray, asRecord, asString, type JsonRecord } from '~/app-kernel/json.ts';
import type {
  GithubActor,
  GithubIssueExtra,
  GithubLabel,
  GithubPullRequest,
} from '~/domain/entities/issues/github-issue.entity.ts';
import type {
  GithubIssueDiscussionEntry,
  GithubIssueReference,
} from '~/domain/entities/issues/github-issue-discussion.entity.ts';
import type {
  GithubIssueEvent,
  GithubIssueEvents,
} from '~/domain/entities/issues/github-issue-events.entity.ts';
import type {
  IssueDependency,
  IssueLedger,
  IssueSummary,
} from '~/domain/entities/issues/issue.entity.ts';

/* GitHub が返した JSON を `IssueSummary` に写す。ネットワークにも時計にも触らない。

   **依存の種類は 2 つに揃える。** 画面が見ているのは `parent-child` と `blocks` だけで、
   GitHub の `parent` と `blockedBy` はそのままその 2 つに当たる。この形に揃えておけば、
   入れ子も依存の辺も blocked の判定も、出所を問わず同じコードが描く。

   読めなかった欄は `null` にする。既定値で埋めると、欄が無かったことと、その値だったことの
   区別が付かなくなる。 */

/** 一覧から落とす状態 */
const CLOSED = 'closed';

/* 閉じた理由まで状態にする。

   GitHub の `state` は open と closed の 2 つしかないが、`stateReason` が `NOT_PLANNED` の
   ものは「やらないことにした」であって「やり終えた」ではない。同じ closed に潰すと、
   片付いた件数が実際より多く見える。 */
const NOT_PLANNED = 'not_planned';

/* 開いているが、他の課題に堰き止められている。
   GitHub の `state` には無く、`blockedBy` を数えてこちらで決める状態である。 */
const BLOCKED = 'blocked';

/** 1 件の課題を名指す形。番号だけだと、依存の辺を張るときに他の記録と見分けが付かない */
const idOf = (number: number): string => `#${number}`;

/** 数値の欄。読めなければ無い */
function numberAt(record: JsonRecord | undefined, key: string): number | null {
  const value = record?.[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

/* `{ nodes: [...] }` の中身。GitHub の connection はどれもこの形をしている。
   欄そのものが無いのは「尋ねなかった」なので、空の並びとして扱う。 */
function nodesOf(record: JsonRecord | undefined, key: string): readonly JsonRecord[] {
  const connection = asRecord(record ?? {}, key);
  if (connection === undefined) return [];
  const nodes = asArray(connection, 'nodes');
  if (nodes === undefined) return [];
  return nodes.filter((node): node is JsonRecord => typeof node === 'object' && node !== null);
}

/* まだ開いている堰き止めの数。**閉じた相手は数えない。**

   `blockedBy` は片付いた相手も返し続ける。全部数えると、掛かっていた課題が全部片付いた後も
   blocked のまま並び、依存グラフの「いま手を付けられる」列に blocked のカードが混ざる。 */
function openBlockersOf(node: JsonRecord): number {
  return nodesOf(node, 'blockedBy').filter(
    (blocker) => (asString(blocker, 'state') ?? '').toLowerCase() !== CLOSED,
  ).length;
}

/* 状態を 1 つの文字列にする。

   **順序が意味を持つ。** 閉じているかを先に見る。閉じた課題にも堰き止めは残るので、
   堰き止めを先に見ると、片付いた課題が blocked として並ぶ。 */
function statusOf(node: JsonRecord, blockedByCount: number): string {
  const state = (asString(node, 'state') ?? '').toLowerCase();
  if (state === CLOSED) {
    return (asString(node, 'stateReason') ?? '').toUpperCase() === 'NOT_PLANNED'
      ? NOT_PLANNED
      : CLOSED;
  }
  if (blockedByCount > 0) return BLOCKED;
  return state;
}

/* 繋がりを 1 つの向きに揃えて並べる。

   `deps` は「この課題が `on` に掛かっている」という向きで持つ。GitHub の `blockedBy` は
   「この課題を堰き止めている相手」なので向きが一致する。`blocking` は逆向きなので**採らない**
   — 逆向きの辺を同じ並びに混ぜると、依存の辺が両向きに引かれて、どちらが先かが読めなくなる。

   親は 1 つだけで、`parent-child` として並べる。画面はこの種類で入れ子を組む。 */
function dependenciesOf(node: JsonRecord): IssueDependency[] {
  const deps: IssueDependency[] = [];

  const parent = asRecord(node, 'parent');
  const parentNumber = numberAt(parent, 'number');
  if (parentNumber !== null) deps.push({ on: idOf(parentNumber), type: 'parent-child' });

  for (const blocker of nodesOf(node, 'blockedBy')) {
    const number = numberAt(blocker, 'number');
    if (number === null) continue;
    deps.push({ on: idOf(number), type: 'blocks' });
  }

  return deps;
}

/** ラベルの名前。`IssueSummary` が持てるのは名前だけで、色は `github` の側へ回す */
function labelsOf(node: JsonRecord): readonly string[] | null {
  const labels = asRecord(node, 'labels');
  if (labels === undefined) return null;
  return nodesOf(node, 'labels')
    .map((label) => asString(label, 'name'))
    .filter((name): name is string => name !== undefined);
}

/* 掛かっている先を全部見られたか。

   `issueDependenciesSummary` は取ってきたページに依らない総数なので、採った数と突き合わせれば
   上限に当たったことが分かる。**総数を尋ねていなければ、足りているとは言えない。**
   尋ねなかったことを「全部見えた」に倒すと、切れた辺が黙って消える。 */
function depsCompleteOf(node: JsonRecord, taken: number): boolean {
  const summary = asRecord(node, 'issueDependenciesSummary');
  if (summary === undefined) return false;
  const total = numberAt(summary, 'totalBlockedBy');
  if (total === null) return false;
  return taken >= total;
}

/** 人 1 人。login が読めない相手は、誰なのか言えないので採らない */
function actorOf(record: JsonRecord | undefined): GithubActor | null {
  if (record === undefined) return null;
  const login = asString(record, 'login');
  if (login === undefined) return null;
  return { login, avatarUrl: asString(record, 'avatarUrl') ?? null };
}

function labelDetailsOf(node: JsonRecord): readonly GithubLabel[] {
  const found: GithubLabel[] = [];
  for (const label of nodesOf(node, 'labels')) {
    const name = asString(label, 'name');
    if (name === undefined) continue;
    found.push({ name, color: asString(label, 'color') ?? null });
  }
  return found;
}

function pullRequestsOf(node: JsonRecord): readonly GithubPullRequest[] {
  const found: GithubPullRequest[] = [];
  for (const pull of nodesOf(node, 'closedByPullRequestsReferences')) {
    const number = numberAt(pull, 'number');
    if (number === null) continue;
    found.push({
      number,
      state: asString(pull, 'state') ?? '',
      isDraft: pull.isDraft === true,
      reviewDecision: asString(pull, 'reviewDecision') ?? null,
      headRefName: asString(pull, 'headRefName') ?? null,
    });
  }
  return found;
}

/** 数えた件数。`{ totalCount }` の形で返るものはどれも同じ読み方をする */
const countOf = (node: JsonRecord, key: string): number =>
  numberAt(asRecord(node, key), 'totalCount') ?? 0;

/* GitHub にしか無い欄をまとめる。

   **無いものを既定値で埋めない。** マイルストーンも型の色も sub-issue も、無いことと
   「0 だった」ことは別である。無ければ `null` のまま外へ出し、描く側に決めさせる。 */
function extraOf(node: JsonRecord): GithubIssueExtra {
  const milestone = asRecord(node, 'milestone');
  const milestoneTitle = milestone === undefined ? undefined : asString(milestone, 'title');
  const sub = asRecord(node, 'subIssuesSummary');
  const subTotal = numberAt(sub, 'total');

  return {
    url: asString(node, 'url') ?? null,
    labels: labelDetailsOf(node),
    assignees: nodesOf(node, 'assignees')
      .map(actorOf)
      .filter((actor): actor is GithubActor => actor !== null),
    author: actorOf(asRecord(node, 'author')),
    milestone:
      milestoneTitle === undefined
        ? null
        : { title: milestoneTitle, dueOn: asString(milestone ?? {}, 'dueOn') ?? null },
    issueTypeColor: asString(asRecord(node, 'issueType') ?? {}, 'color') ?? null,
    subIssues:
      subTotal === null ? null : { total: subTotal, completed: numberAt(sub, 'completed') ?? 0 },
    pullRequests: pullRequestsOf(node),
    comments: countOf(node, 'comments'),
    reactions: countOf(node, 'reactions'),
  };
}

/* 担当は 1 人だけ載せる。GitHub は複数を持てるが、`IssueSummary` の欄は 1 つで、画面も
   それに合わせて組んである。全員が要るときは `github.assignees` の側を読む。**先頭を採る**
   — 誰も担当していないのと、複数居るのを混同しないため、居るなら必ず 1 人は出す。 */
function assigneeOf(node: JsonRecord): string | null {
  const first = nodesOf(node, 'assignees')[0];
  if (first === undefined) return null;
  return asString(first, 'login') ?? null;
}

function toSummary(node: JsonRecord): IssueSummary | null {
  const number = numberAt(node, 'number');
  if (number === null) return null;

  const deps = dependenciesOf(node);
  const blockedBy = deps.filter((dependency) => dependency.type === 'blocks').length;

  return {
    id: idOf(number),
    title: asString(node, 'title') ?? null,
    status: statusOf(node, openBlockersOf(node)),
    issueType: asString(asRecord(node, 'issueType') ?? {}, 'name') ?? null,
    labels: labelsOf(node),
    assignee: assigneeOf(node),
    createdAt: asString(node, 'createdAt') ?? null,
    updatedAt: asString(node, 'updatedAt') ?? null,
    closedAt: asString(node, 'closedAt') ?? null,
    deps,
    depsComplete: depsCompleteOf(node, blockedBy),
    github: extraOf(node),
  };
}

/** 応答 1 ページぶん。次のページを求めるのに要るものと、課題そのもの */
export interface GithubIssuePage {
  readonly nodes: readonly JsonRecord[];
  readonly endCursor: string | null;
  readonly hasNextPage: boolean;
}

/* 応答 1 ページを読む。読めない応答は空のページとして返す。

   **`errors` が付いた応答をここで見分けない。** GraphQL は一部だけ失敗した応答にも
   `data` を載せてくるが、それが何件の取りこぼしなのかはここでは分からない。失敗として
   扱うかを決めるのは、起こした側である。 */
export function parseIssuePage(text: string): GithubIssuePage {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { nodes: [], endCursor: null, hasNextPage: false };
  }
  if (typeof parsed !== 'object' || parsed === null) {
    return { nodes: [], endCursor: null, hasNextPage: false };
  }

  const data = asRecord(parsed as JsonRecord, 'data');
  const repository = asRecord(data ?? {}, 'repository');
  const issues = asRecord(repository ?? {}, 'issues');
  if (issues === undefined) return { nodes: [], endCursor: null, hasNextPage: false };

  const pageInfo = asRecord(issues, 'pageInfo');
  const nodes = asArray(issues, 'nodes') ?? [];

  return {
    nodes: nodes.filter((node): node is JsonRecord => typeof node === 'object' && node !== null),
    endCursor: asString(pageInfo ?? {}, 'endCursor') ?? null,
    hasNextPage: pageInfo?.hasNextPage === true,
  };
}

/* 課題 1 件の本文を取り出す。

   **本文が空なのと、本文を採れなかったのを分ける。** GitHub は本文の無い課題に空文字列を
   返すので、それをそのまま `null` に潰すと、応答が壊れていたのと区別が付かなくなる。
   ここが `null` を返すのは、応答から `issue` を辿れなかったときだけである。 */
export function parseIssueBody(text: string): string | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return null;
  }
  if (typeof parsed !== 'object' || parsed === null) return null;

  const data = asRecord(parsed as JsonRecord, 'data');
  const repository = asRecord(data ?? {}, 'repository');
  const issue = asRecord(repository ?? {}, 'issue');
  if (issue === undefined) return null;

  const body = issue.body;
  return typeof body === 'string' ? body : null;
}

/** やり取り 1 ページぶん。次のページを求めるのに要るものと、読めた項目 */
export interface GithubIssueDiscussionPage {
  readonly entries: readonly GithubIssueDiscussionEntry[];
  readonly endCursor: string | null;
  readonly hasNextPage: boolean;
}

/** `login` の欄を 1 つ読む。GitHub は消えたユーザーや権限の無い相手に `null` を返す */
const loginAt = (node: JsonRecord, key: string): string | null =>
  asString(asRecord(node, key), 'login') ?? null;

/** 名指された課題か PR。番号が読めなければ、何を指したのか言えない */
function referenceAt(node: JsonRecord, key: string): GithubIssueReference | null {
  const target = asRecord(node, key);
  const number = numberAt(target, 'number');
  if (number === null) return null;
  return { number, title: asString(target, 'title') ?? null };
}

/** 付け外しされたラベル。名前が読めなければ、どのラベルの話なのか言えない */
function labelAt(node: JsonRecord, key: string): GithubLabel | null {
  const label = asRecord(node, key);
  const name = asString(label, 'name');
  if (name === undefined) return null;
  return { name, color: asString(label, 'color') ?? null };
}

/* `timeline` の項目 1 つを読む。何が起きたのか言えないものは採らない。

   時刻の読めない項目は採らない。並びの中に置く位置が決まらず、いつの話か言えないためである。
   ラベルや名指された課題も同じで、「どれか分からないラベルが付いた」という項目は、
   画面に出しても読む人に何も伝えない。 */
function entryOf(node: JsonRecord): GithubIssueDiscussionEntry | null {
  const at = asString(node, 'createdAt');
  if (at === undefined) return null;
  const actor = loginAt(node, 'actor');

  switch (asString(node, '__typename')) {
    case 'IssueComment':
      return {
        kind: 'comment',
        at,
        // コメントを書いた人は `actor` ではなく `author` に入る
        actor: loginAt(node, 'author'),
        body: asString(node, 'body') ?? null,
      };
    case 'ClosedEvent':
      return { kind: 'closed', at, actor, reason: asString(node, 'stateReason') ?? null };
    case 'ReopenedEvent':
      return { kind: 'reopened', at, actor };
    case 'LabeledEvent': {
      const label = labelAt(node, 'label');
      return label === null ? null : { kind: 'labeled', at, actor, label };
    }
    case 'UnlabeledEvent': {
      const label = labelAt(node, 'label');
      return label === null ? null : { kind: 'unlabeled', at, actor, label };
    }
    case 'AssignedEvent':
      return { kind: 'assigned', at, actor, assignee: loginAt(node, 'assignee') };
    case 'UnassignedEvent':
      return { kind: 'unassigned', at, actor, assignee: loginAt(node, 'assignee') };
    case 'MilestonedEvent':
      return {
        kind: 'milestoned',
        at,
        actor,
        milestoneTitle: asString(node, 'milestoneTitle') ?? null,
      };
    case 'DemilestonedEvent':
      return {
        kind: 'demilestoned',
        at,
        actor,
        milestoneTitle: asString(node, 'milestoneTitle') ?? null,
      };
    case 'RenamedTitleEvent':
      return {
        kind: 'renamed',
        at,
        actor,
        previousTitle: asString(node, 'previousTitle') ?? null,
        currentTitle: asString(node, 'currentTitle') ?? null,
      };
    case 'ParentIssueAddedEvent': {
      const parent = referenceAt(node, 'parent');
      return parent === null ? null : { kind: 'parent-added', at, actor, parent };
    }
    case 'BlockedByAddedEvent': {
      const blockingIssue = referenceAt(node, 'blockingIssue');
      return blockingIssue === null ? null : { kind: 'blocked-by-added', at, actor, blockingIssue };
    }
    case 'MarkedAsDuplicateEvent': {
      const canonical = referenceAt(node, 'canonical');
      return canonical === null ? null : { kind: 'marked-as-duplicate', at, actor, canonical };
    }
    case 'CrossReferencedEvent': {
      const source = referenceAt(node, 'source');
      if (source === null) return null;
      return {
        kind: 'cross-referenced',
        at,
        actor,
        source,
        willCloseTarget: node.willCloseTarget === true,
      };
    }
    default:
      return null;
  }
}

/* 課題 1 件のやり取りを 1 ページぶん読む。応答から `timelineItems` を辿れなければ `null`。

   **`errors` が付いた応答をここで見分けない。** `parseIssuePage` と同じで、一部だけ失敗した
   応答にも GraphQL は `data` を載せてくる。失敗として扱うかを決めるのは、起こした側である。

   知らない種類の項目は飛ばす。**ここで飛ばすのは、一覧で飛ばすのとは意味が違う** — 一覧は
   採った課題どうしを突き合わせて件数や依存の辺や blocked を決めるので、1 件落ちると残りの
   行の言うことまで変わる。やり取りは項目を 1 つずつ読むだけで、どの項目も他の項目から
   何かを導かない。飛ばした項目は自分の分しか消さない。ただしそのぶん、読めた項目の数は
   起きたことの数ではないので、件数をここから数えてはいけない。 */
export function parseIssueDiscussion(text: string): GithubIssueDiscussionPage | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return null;
  }
  if (typeof parsed !== 'object' || parsed === null) return null;

  const data = asRecord(parsed as JsonRecord, 'data');
  const repository = asRecord(data ?? {}, 'repository');
  const issue = asRecord(repository ?? {}, 'issue');
  const timeline = asRecord(issue ?? {}, 'timelineItems');
  if (timeline === undefined) return null;

  const pageInfo = asRecord(timeline, 'pageInfo');
  const nodes = asArray(timeline, 'nodes') ?? [];
  const entries: GithubIssueDiscussionEntry[] = [];
  for (const node of nodes) {
    if (typeof node !== 'object' || node === null) continue;
    const entry = entryOf(node as JsonRecord);
    if (entry !== null) entries.push(entry);
  }

  return {
    entries,
    endCursor: asString(pageInfo ?? {}, 'endCursor') ?? null,
    hasNextPage: pageInfo?.hasNextPage === true,
  };
}

/* 一覧ぶんのイベント 1 ページ。次のページを求めるのに要るものと、課題ごとのイベント */
export interface GithubIssueEventsPage {
  readonly issues: readonly GithubIssueEvents[];
  readonly endCursor: string | null;
  readonly hasNextPage: boolean;
}

/* `__typename` からイベントの名前へ。**`entryOf` と同じ言葉を返す。**

   値の型を `GithubIssueDiscussionEntry['kind']` に縛ってあるので、パネルの側が名前を変えれば
   ここもコンパイルで落ちる。同じイベントをパネルと点で違う名前で呼ぶことがなくなる。 */
const EVENT_KINDS: Readonly<Record<string, GithubIssueDiscussionEntry['kind']>> = {
  IssueComment: 'comment',
  ClosedEvent: 'closed',
  ReopenedEvent: 'reopened',
  LabeledEvent: 'labeled',
  UnlabeledEvent: 'unlabeled',
  AssignedEvent: 'assigned',
  UnassignedEvent: 'unassigned',
  MilestonedEvent: 'milestoned',
  DemilestonedEvent: 'demilestoned',
  RenamedTitleEvent: 'renamed',
  ParentIssueAddedEvent: 'parent-added',
  BlockedByAddedEvent: 'blocked-by-added',
  MarkedAsDuplicateEvent: 'marked-as-duplicate',
  CrossReferencedEvent: 'cross-referenced',
};

/* 課題 1 件ぶんのイベント。`createdAt` を読めない項目と、知らない `__typename` は落とす。

   切られたかどうかは GitHub の `totalCount` と、**返ってきた項目の数**で決める。読めたイベントの
   数と比べてはいけない —— こちらが落とした項目まで切られたことにしてしまう。 */
function eventsOf(node: JsonRecord): GithubIssueEvents | null {
  const number = numberAt(node, 'number');
  if (number === null) return null;

  const timeline = asRecord(node, 'timelineItems');
  const nodes = asArray(timeline ?? {}, 'nodes') ?? [];
  const events: GithubIssueEvent[] = [];
  for (const item of nodes) {
    if (typeof item !== 'object' || item === null) continue;
    const record = item as JsonRecord;
    const at = asString(record, 'createdAt');
    const kind = EVENT_KINDS[asString(record, '__typename') ?? ''];
    if (at === undefined || kind === undefined) continue;
    events.push({ at, kind });
  }

  const total = numberAt(timeline ?? {}, 'totalCount');
  return {
    id: idOf(number),
    events,
    truncated: total !== null && total > nodes.length,
  };
}

/* 一覧ぶんのイベント 1 ページを読む。

   `parseIssuePage` と同じく、`errors` が付いた応答をここで見分けない。失敗として扱うかを
   決めるのは、起こした側である。 */
export function parseIssueEventsPage(text: string): GithubIssueEventsPage | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return null;
  }
  if (typeof parsed !== 'object' || parsed === null) return null;

  const data = asRecord(parsed as JsonRecord, 'data');
  const repository = asRecord(data ?? {}, 'repository');
  const issues = asRecord(repository ?? {}, 'issues');
  if (issues === undefined) return null;

  const pageInfo = asRecord(issues, 'pageInfo');
  const nodes = asArray(issues, 'nodes') ?? [];
  const found: GithubIssueEvents[] = [];
  for (const node of nodes) {
    if (typeof node !== 'object' || node === null) continue;
    const events = eventsOf(node as JsonRecord);
    if (events !== null) found.push(events);
  }

  return {
    issues: found,
    endCursor: asString(pageInfo ?? {}, 'endCursor') ?? null,
    hasNextPage: pageInfo?.hasNextPage === true,
  };
}

/* 集めたページを 1 つの台帳にする。

   **順序が意味を持つ。** 状態を採る → 数える → 落とす、の順である。数えるより先に落とすと、
   閉じた課題が `counts` から消え、「閉じたものは 1 つも無い」ように見える。 */
export function buildLedger(
  nodes: readonly JsonRecord[],
  options: { includeClosed: boolean; truncated: boolean },
): IssueLedger {
  const issues: IssueSummary[] = [];
  /* 状態の文字列を決めるのは GitHub であって、こちらではない。`constructor` のような状態が
     来ても数値が化けないよう、プロトタイプを継がないオブジェクトに数える。 */
  const counts: Record<string, number> = Object.create(null);

  for (const node of nodes) {
    const summary = toSummary(node);
    if (summary === null) continue;
    counts[summary.status] = (counts[summary.status] ?? 0) + 1;
    if (!options.includeClosed && (summary.status === CLOSED || summary.status === NOT_PLANNED)) {
      continue;
    }
    issues.push(summary);
  }

  return { issues, counts, truncated: options.truncated };
}
