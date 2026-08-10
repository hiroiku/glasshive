import type { GitOverviewJson, GitTipJson } from '~/interface/presenters/git/git.presenter.ts';
import type {
  GithubPullRequestJson,
  IssueSummaryJson,
} from '~/interface/presenters/issues/issues.presenter.ts';

/* 課題とブランチを結ぶ。

   **繋ぎ目は PR の `head_ref_name` 1 本だけである。** 課題は「なぜやるか」、ブランチは
   「どこでやっているか」で、その 2 つを繋いでいるのは PR である。glasshive は両方を
   別々に観測できるので、ここで突き合わせておけば、どちらの側から見ても相手が見える。

   突き合わせに使うのは名前だけで、名前が一致しなければ結ばない。**推測で結ばない** ——
   似た名前を寄せると、別のブランチの遅れを課題の欄に出すことになる。 */

/** 課題の側から見たブランチの状態 */
export interface BranchState {
  readonly name: string;
  readonly ahead: number;
  readonly behind: number;
  /** worktree の名前。ブランチが worktree に出ていなければ `null` */
  readonly worktree: string | null;
  /** 同じファイルを触っている相手のブランチ */
  readonly conflictsWith: readonly string[];
}

/** ブランチ名から `tip` を引く */
export function tipIndex(git: GitOverviewJson | null): ReadonlyMap<string, GitTipJson> {
  const index = new Map<string, GitTipJson>();
  for (const tip of git?.tips ?? []) {
    // worktree と branch が同じ名前で 2 本来ることがある。worktree の側が実際に人が居る場所である
    if (tip.kind === 'worktree' || !index.has(tip.name)) index.set(tip.name, tip);
  }
  return index;
}

/** ブランチ名から、そのブランチと衝突する相手を引く */
function conflictIndex(git: GitOverviewJson | null): ReadonlyMap<string, string[]> {
  const index = new Map<string, string[]>();
  const add = (from: string, to: string) => {
    const found = index.get(from) ?? [];
    if (!found.includes(to)) found.push(to);
    index.set(from, found);
  };
  for (const conflict of git?.conflicts ?? []) {
    add(conflict.a, conflict.b);
    add(conflict.b, conflict.a);
  }
  return index;
}

/* 課題 1 件に付くブランチの状態。

   **PR が無ければ `null` を返す。** ブランチを名前の似ているところから探しに行かない ——
   課題の id をブランチ名に含める運用は在るが、含めない運用も同じくらい在る。 */
export function branchStateOf(
  issue: Pick<IssueSummaryJson, 'github'>,
  tips: ReadonlyMap<string, GitTipJson>,
  conflicts: ReadonlyMap<string, string[]>,
): BranchState | null {
  for (const pull of issue.github?.pull_requests ?? []) {
    const name = pull.head_ref_name;
    if (name === null) continue;
    const tip = tips.get(name);
    if (tip === undefined) continue;
    return {
      name,
      ahead: tip.ahead,
      behind: tip.behind,
      worktree: tip.worktree,
      conflictsWith: conflicts.get(name) ?? [],
    };
  }
  return null;
}

/** ブランチ名から、そのブランチの PR が閉じる課題を引く */
export function issuesByBranch(
  issues: readonly IssueSummaryJson[],
): ReadonlyMap<string, readonly IssueSummaryJson[]> {
  const index = new Map<string, IssueSummaryJson[]>();
  for (const issue of issues) {
    for (const pull of issue.github?.pull_requests ?? []) {
      if (pull.head_ref_name === null) continue;
      const found = index.get(pull.head_ref_name) ?? [];
      found.push(issue);
      index.set(pull.head_ref_name, found);
    }
  }
  return index;
}

/* ブランチ名から、そこに乗っている PR を引く。

   **開いているものを先に採る。** 同じブランチで PR を出し直すことがあり、そのとき閉じた
   ほうを出すと、いま動いている作業が終わったものに見える。 */
export function pullsByBranch(
  issues: readonly IssueSummaryJson[],
): ReadonlyMap<string, GithubPullRequestJson> {
  const index = new Map<string, GithubPullRequestJson>();
  for (const issue of issues) {
    for (const pull of issue.github?.pull_requests ?? []) {
      const name = pull.head_ref_name;
      if (name === null) continue;
      const found = index.get(name);
      if (found === undefined || (found.state !== 'OPEN' && pull.state === 'OPEN')) {
        index.set(name, pull);
      }
    }
  }
  return index;
}

/** 課題の側から見た PR とブランチをまとめて引くためのインデックス一式 */
export interface WorkJoin {
  readonly tips: ReadonlyMap<string, GitTipJson>;
  readonly conflicts: ReadonlyMap<string, string[]>;
  readonly byBranch: ReadonlyMap<string, readonly IssueSummaryJson[]>;
  readonly pullByBranch: ReadonlyMap<string, GithubPullRequestJson>;
}

export function buildWorkJoin(
  git: GitOverviewJson | null,
  issues: readonly IssueSummaryJson[],
): WorkJoin {
  return {
    tips: tipIndex(git),
    conflicts: conflictIndex(git),
    byBranch: issuesByBranch(issues),
    pullByBranch: pullsByBranch(issues),
  };
}
