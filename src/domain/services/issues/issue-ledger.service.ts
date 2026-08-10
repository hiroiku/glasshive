import {
  asArray,
  asString,
  hasKey,
  type JsonRecord,
  parseFirstJsonLine,
  parseJsonlLines,
} from '~/app-kernel/json.ts';
import type {
  IssueDependency,
  IssueLedger,
  IssueRecord,
  IssueSummary,
} from '~/domain/entities/issues/issue.entity.ts';

/* 台帳のテキストをパースする。ファイルにも時計にも触らない。

   台帳には課題以外の記録も混ざる。`_type` が在って `'issue'` でない行は課題ではない。
   欄そのものが無い行は素通りさせる — 古い書き出しには `_type` が付いていない。

   **読めた課題だけを返す。** 数値だけの行や `null` の行は課題ではないので、欄が空の課題として
   並べたりはしない。1 行の壊れで一覧ぜんぶを失わないのと同じ理屈で、壊れた 1 行を
   課題に化けさせもしない。 */

/** この状態の課題は、求められない限り一覧から落とす */
const CLOSED = 'closed';

const isIssueLine = (record: JsonRecord): boolean =>
  !hasKey(record, '_type') || record._type === 'issue';

/* 数値の欄。読めなければ無い。

   `asInt` は読めない欄を 0 と数えるが、優先度の 0 は「最も高い」であって「無い」ではない。
   同じ 0 に潰すと、書かれていない課題が最優先として並ぶ。 */
function asNumber(record: JsonRecord, key: string): number | null {
  const value = record[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

/** 並びでなければ繋がりは無い。中の 1 つ 1 つも、文字列で書かれた欄だけを採る */
function toDependencies(record: JsonRecord): IssueDependency[] {
  const listed = asArray(record, 'dependencies');
  if (listed === undefined) return [];
  return listed.map((dependency) => ({
    on: asString(dependency, 'depends_on_id') ?? null,
    type: asString(dependency, 'type') ?? null,
  }));
}

/** ラベルは文字列の並び。文字列でないものが混ざっていたら、その 1 つだけを落とす */
function toLabels(record: JsonRecord): readonly string[] | null {
  const listed = asArray(record, 'labels');
  if (listed === undefined) return null;
  return listed.filter((label): label is string => typeof label === 'string');
}

function toSummary(record: JsonRecord, status: string): IssueSummary {
  return {
    id: asString(record, 'id') ?? null,
    title: asString(record, 'title') ?? null,
    status,
    priority: asNumber(record, 'priority'),
    issueType: asString(record, 'issue_type') ?? null,
    labels: toLabels(record),
    assignee: asString(record, 'assignee') ?? null,
    owner: asString(record, 'owner') ?? null,
    createdAt: asString(record, 'created_at') ?? null,
    updatedAt: asString(record, 'updated_at') ?? null,
    deps: toDependencies(record),
    // ファイルの台帳はいつも全部を読むので、掛かっている先が欠けることはない
    depsComplete: true,
    // GitHub にしか無い欄。台帳には書かれていない
    github: null,
    // description はここに載せない。1 件を引くときだけ全部を返す
  };
}

/* 台帳ぜんぶを一覧にする。

   **順序が意味を持つ。** 状態を採る → 数える → 落とす、の順である。数えるより先に
   落とすと、閉じた課題が `counts` から消え、「閉じたものは 1 つも無い」ように見える。 */
export function parseLedger(text: string, options: { includeClosed: boolean }): IssueLedger {
  const issues: IssueSummary[] = [];
  /* 件数の集計は、プロトタイプを継がないオブジェクトに置く。

     状態の文字列を決めるのは台帳であって、こちらではない。`constructor` や `toString` という
     状態が来ると、ふつうの `{}` は継いだ関数を読み出してしまい、数値が文字列に化けて外へ出る。
     `__proto__` に至っては代入そのものが黙って捨てられ、**一覧に並んでいる課題が
     件数から消える** — glasshive がいちばん出してはいけない嘘である。 */
  const counts: Record<string, number> = Object.create(null);

  for (const record of parseJsonlLines(text)) {
    if (!isIssueLine(record)) continue;
    const status = asString(record, 'status') ?? '';
    counts[status] = (counts[status] ?? 0) + 1;
    if (!options.includeClosed && status === CLOSED) continue;
    issues.push(toSummary(record, status));
  }

  // ファイルの台帳は全部を読む。読み取り範囲を掛けないので、切れる余地が無い
  return { issues, counts, truncated: false };
}

/* 1 件を引く。見付からなければ投げずに `null` を返す。

   `"<id>"` を含む行だけをパースする。台帳の 1 行には本文もメモ(`notes`)も入っていて、
   全行をパースすると 1 件を引くたびに台帳ぜんぶを組み立て直すことになる。id はその課題の行に
   必ず文字列として現れるので、この絞り込みで当たりを落とすことはない。 */
export function findIssueRecord(text: string, id: string): IssueRecord | null {
  const needle = `"${id}"`;
  for (const line of text.split('\n')) {
    if (!line.includes(needle)) continue;
    const record = parseFirstJsonLine(line);
    if (record === undefined) continue;
    if (isIssueLine(record) && record.id === id) return record;
  }
  return null;
}
