import type { IssueSummaryJson } from '~/interface/presenters/issues/issues.presenter.ts';
import type { MatchedWorker, WorkerIndex } from './workers.ts';
import { workersOn } from './workers.ts';
import type { WorkJoin } from './workJoin.ts';

/* マイルストーンを、課題とブランチと並ぶ 3 つ目の単位として起こす。

   **新しい観測ではない。** GitHub は課題 1 件ごとにマイルストーンの名前と期日を返すので、
   ここでやるのは取ってきた課題を名前で束ねることだけである。`gh` を余分に走らせない。

   束の中身は課題だけではない。その課題を閉じる PR が乗っているブランチと、いまその課題を
   触っているエージェントも一緒に持たせる —— 「この区切りに間に合うのか」を読むのに要るのは
   残りの件数だけではなく、いま誰が何を触っているかである。 */

/** マイルストーンの付いていない課題を束ねる先。名前が無いことを名前で表さない */
export const NO_MILESTONE = null;

export interface MilestoneRow {
  /** マイルストーンの名前。`null` はマイルストーンが付いていない課題の束 */
  readonly title: string | null;
  readonly dueOn: string | null;
  readonly total: number;
  readonly closed: number;
  readonly open: number;
  /** 開いていて、まだ他の課題に堰き止められているもの */
  readonly blocked: number;
  readonly issues: readonly IssueSummaryJson[];
  /** この束の課題を閉じる PR が乗っているブランチ */
  readonly branches: readonly string[];
  readonly workers: readonly MatchedWorker[];
}

const CLOSED = new Set(['closed', 'not_planned']);

/** 期日の無いマイルストーンは、期日のあるものの後ろへ。並びの上では最も遠い先 */
const dueRank = (dueOn: string | null): number => {
  if (dueOn === null) return Number.MAX_SAFE_INTEGER;
  const atMs = Date.parse(dueOn);
  return Number.isFinite(atMs) ? atMs : Number.MAX_SAFE_INTEGER;
};

export function buildMilestones(
  issues: readonly IssueSummaryJson[],
  join: WorkJoin | undefined,
  workers: WorkerIndex,
): readonly MilestoneRow[] {
  const buckets = new Map<
    string,
    { title: string | null; dueOn: string | null; issues: IssueSummaryJson[] }
  >();

  for (const issue of issues) {
    const milestone = issue.github?.milestone ?? null;
    const title = milestone?.title ?? NO_MILESTONE;
    const key = title ?? '';
    const found = buckets.get(key);
    if (found === undefined) {
      buckets.set(key, { title, dueOn: milestone?.due_on ?? null, issues: [issue] });
      continue;
    }
    found.issues.push(issue);
    /* 期日は課題ごとに付いてくるので、同じ名前でも空の課題が混ざる。**空で上書きしない** —
       上書きすると、期日のあるマイルストーンが束ね直すたびに期日を失う。 */
    if (found.dueOn === null) found.dueOn = milestone?.due_on ?? null;
  }

  const rows: MilestoneRow[] = [];
  for (const bucket of buckets.values()) {
    const closed = bucket.issues.filter((issue) => CLOSED.has(issue.status)).length;
    const blocked = bucket.issues.filter((issue) => issue.status === 'blocked').length;

    const branches = new Set<string>();
    const seenWorkers = new Set<string>();
    const found: MatchedWorker[] = [];
    for (const issue of bucket.issues) {
      const pulls = issue.github?.pull_requests ?? [];
      for (const pull of pulls) {
        /* 手元に生きているブランチだけを採る。**閉じた PR の消えたブランチを並べない** —
           押しても何も無い名前が並ぶ。 */
        if (pull.head_ref_name !== null && join?.tips.has(pull.head_ref_name) === true) {
          branches.add(pull.head_ref_name);
        }
      }
      for (const worker of workersOn(workers, issue)) {
        if (seenWorkers.has(worker.file)) continue;
        seenWorkers.add(worker.file);
        found.push(worker);
      }
    }

    rows.push({
      title: bucket.title,
      dueOn: bucket.dueOn,
      total: bucket.issues.length,
      closed,
      open: bucket.issues.length - closed,
      blocked,
      issues: bucket.issues,
      branches: [...branches].sort(),
      workers: found,
    });
  }

  /* 期日の近い順。**期日の無い束と、マイルストーンの付いていない束は最後へ** —
     期日で読む一覧なので、期日を持たないものが先頭に来ると区切りの並びが読めなくなる。 */
  return rows.sort((a, b) => {
    const byNone = Number(a.title === null) - Number(b.title === null);
    if (byNone !== 0) return byNone;
    const byDue = dueRank(a.dueOn) - dueRank(b.dueOn);
    if (byDue !== 0) return byDue;
    return (a.title ?? '').localeCompare(b.title ?? '');
  });
}

/** 一覧をマイルストーンで束ねた 1 束 */
export interface MilestoneBand {
  /** マイルストーンの名前。`null` は付いていない課題の束 */
  readonly title: string | null;
  readonly dueOn: string | null;
  readonly total: number;
  readonly open: number;
  /** 渡された並びをそのまま保った課題 */
  readonly issues: readonly IssueSummaryJson[];
}

/* 一覧を、マイルストーンで束ねる。

   **`buildMilestones` とは別のものである。** あちらは「区切りに間に合うのか」を読む
   マイルストーンの一覧で、ブランチもエージェントも数える。こちらは課題の一覧を並べ替える
   だけなので、束の中の並びは渡されたまま —— 検索と並べ替えを済ませた順のまま —— に保つ。
   ここで並べ直すと、着手順を選んでいる人の待ち行列が束の中で崩れる。

   束ねるのは渡された課題だけである。絞り込みで 1 件も残らなかったマイルストーンの束は
   出さない —— 出ていない課題の見出しだけが並ぶことになる。 */
export function milestoneBands(issues: readonly IssueSummaryJson[]): readonly MilestoneBand[] {
  const buckets = new Map<
    string,
    { title: string | null; dueOn: string | null; issues: IssueSummaryJson[] }
  >();

  for (const issue of issues) {
    const milestone = issue.github?.milestone ?? null;
    const title = milestone?.title ?? NO_MILESTONE;
    const key = title ?? '';
    const found = buckets.get(key);
    if (found === undefined) {
      buckets.set(key, { title, dueOn: milestone?.due_on ?? null, issues: [issue] });
      continue;
    }
    found.issues.push(issue);
    // 期日は課題ごとに付いてくるので、空で上書きしない
    if (found.dueOn === null) found.dueOn = milestone?.due_on ?? null;
  }

  return [...buckets.values()]
    .map((bucket) => ({
      title: bucket.title,
      dueOn: bucket.dueOn,
      total: bucket.issues.length,
      open: bucket.issues.filter((issue) => !CLOSED.has(issue.status)).length,
      issues: bucket.issues,
    }))
    .sort((a, b) => {
      const byNone = Number(a.title === null) - Number(b.title === null);
      if (byNone !== 0) return byNone;
      const byDue = dueRank(a.dueOn) - dueRank(b.dueOn);
      if (byDue !== 0) return byDue;
      return (a.title ?? '').localeCompare(b.title ?? '');
    });
}

/** その課題が属するマイルストーンの名前。付いていなければ `null` */
export const milestoneOf = (issue: IssueSummaryJson): string | null =>
  issue.github?.milestone?.title ?? null;

/* ブランチ 1 本が関わっているマイルストーン。**PR を経由して数える** —
   ブランチそのものはマイルストーンを持たない。持っているのは、その PR が閉じる課題である。 */
export function milestonesOnBranch(
  branch: string,
  issues: readonly IssueSummaryJson[],
): readonly string[] {
  const found = new Set<string>();
  for (const issue of issues) {
    const title = milestoneOf(issue);
    if (title === null) continue;
    const onBranch = (issue.github?.pull_requests ?? []).some(
      (pull) => pull.head_ref_name === branch,
    );
    if (onBranch) found.add(title);
  }
  return [...found].sort();
}
