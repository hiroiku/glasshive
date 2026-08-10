import { asArray, asRecord, asString, type JsonRecord } from '~/app-kernel/json.ts';
import type {
  GithubActor,
  GithubIssueExtra,
  GithubLabel,
  GithubPullRequest,
} from '~/domain/entities/issues/github-issue.entity.ts';
import type {
  IssueDependency,
  IssueLedger,
  IssueSummary,
} from '~/domain/entities/issues/issue.entity.ts';

/* GitHub が返した JSON を、台帳と同じ課題に写す。ネットワークにも時計にも触らない。

   **写す先を bd と同じ形にするのが要点である。** 依存の種類として画面が見ているのは
   `parent-child` と `blocks` の 2 つだけで、GitHub の `parent` と `blockedBy` はそのまま
   その 2 つに当たる。同じ形に写しておけば、入れ子も依存の辺も blocked の判定も、
   台帳のときと同じコードが描く。

   GitHub に無い欄は `null` にする。優先度がそれで、GitHub には概念が無い。ラベルの `P0` を
   優先度として読む手はあるが、それはリポジトリごとの約束であって GitHub の欄ではないので、
   ここでは読まない。 */

/** 一覧から落とす状態。bd の台帳と同じ言葉を使う */
const CLOSED = 'closed';

/* 閉じた理由まで状態にする。

   GitHub の `state` は open と closed の 2 つしかないが、`stateReason` が `NOT_PLANNED` の
   ものは「やらないことにした」であって「やり終えた」ではない。同じ closed に潰すと、
   片付いた件数が実際より多く見える。 */
const NOT_PLANNED = 'not_planned';

/** 開いているが、他の課題に堰き止められている。bd の台帳が持つ状態と同じ名前にする */
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

/* 繋がりを、台帳と同じ向きで並べる。

   台帳の `deps` は「この課題が `on` に掛かっている」という向きで書かれている。GitHub の
   `blockedBy` は「この課題を堰き止めている相手」なので向きが一致する。`blocking` は逆向き
   なので**採らない** — 逆向きの辺を同じ並びに混ぜると、依存の辺が両向きに引かれて、
   どちらが先かが読めなくなる。

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

/** ラベルの名前。台帳と同じ形に写せるのは名前だけで、色は `github` の側へ回す */
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

/* 担当は 1 人だけ載せる。GitHub は複数を持てるが、台帳の欄は 1 つで、画面もそれに合わせて
   組んである。**先頭を採る** — 誰も担当していないのと、複数居るのを混同しないため、
   居るなら必ず 1 人は出す。 */
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
    // GitHub に優先度の欄は無い
    priority: null,
    issueType: asString(asRecord(node, 'issueType') ?? {}, 'name') ?? null,
    labels: labelsOf(node),
    assignee: assigneeOf(node),
    owner: asString(asRecord(node, 'author') ?? {}, 'login') ?? null,
    createdAt: asString(node, 'createdAt') ?? null,
    updatedAt: asString(node, 'updatedAt') ?? null,
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

/* 集めたページを 1 つの台帳にする。

   **順序が意味を持つ。** 状態を採る → 数える → 落とす、の順である。数えるより先に落とすと、
   閉じた課題が `counts` から消え、「閉じたものは 1 つも無い」ように見える。台帳を読むときと
   同じ決まりで、同じ理由による。 */
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
