import type { GitOverviewJson, GitTipJson } from '~/interface/presenters/git/git.presenter.ts';
import type {
  GithubPullRequestJson,
  IssueSummaryJson,
} from '~/interface/presenters/issues/issues.presenter.ts';
import { leadPullRequest } from './githubIssue.ts';

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

/* 手元の git をどこまで観測できたか。**空の `tips` が何を指すかは、これでしか決まらない。**

   `absent` はここに要らない —— git のリポジトリでないディレクトリにブランチが 0 本なのは、
   観測して言える事実である。分けるのは、まだ読んでいない(`pending`)のと、読みに行って
   読めなかった(`unobservable`)の 2 つで、どちらも 0 本と言ってはいけない。 */
export type GitReach = 'observed' | 'pending' | 'unobservable';

/** 課題の側から見た PR とブランチをまとめて引くためのインデックス一式 */
export interface WorkJoin {
  readonly reach: GitReach;
  readonly tips: ReadonlyMap<string, GitTipJson>;
  readonly conflicts: ReadonlyMap<string, string[]>;
  readonly byBranch: ReadonlyMap<string, readonly IssueSummaryJson[]>;
  readonly pullByBranch: ReadonlyMap<string, GithubPullRequestJson>;
}

export function buildWorkJoin(
  git: GitOverviewJson | null,
  reach: GitReach,
  issues: readonly IssueSummaryJson[],
): WorkJoin {
  return {
    reach,
    tips: tipIndex(git),
    conflicts: conflictIndex(git),
    byBranch: issuesByBranch(issues),
    pullByBranch: pullsByBranch(issues),
  };
}

/* 課題 1 件に付くブランチ。**PR が名指しているのに手元を観測できていないことを、
   ブランチが無いことにしない。**

   PR そのものは GitHub から読めているので、ブランチの名前は分かっている。分からないのは手元での
   遅れと衝突のほうである。ここを `null` に潰すと、衝突しているブランチが衝突していない
   ものとして読まれ、行からは何も消えていないように見える。

   観測できていないときに名指すのは、開いている PR のブランチだけである。`tips` が無いので
   `branchStateOf` の「手元に在るものを選ぶ」が使えず、代わりに行の PR のチップと同じ
   `leadPullRequest` を見る —— 同じ行の 2 つのチップが別の PR を名指すと、どちらの話なのかが
   読めない。閉じた PR のブランチはたいてい手元にも残っていないので、そこには何も出さない。 */
export type IssueBranch =
  | { readonly kind: 'observed'; readonly branch: BranchState }
  | {
      readonly kind: 'unread';
      readonly name: string;
      readonly reach: Exclude<GitReach, 'observed'>;
    };

export function issueBranchOf(
  issue: Pick<IssueSummaryJson, 'github'>,
  join: WorkJoin,
): IssueBranch | null {
  if (join.reach !== 'observed') {
    const pull = leadPullRequest(issue);
    const name = pull?.state === 'OPEN' ? pull.head_ref_name : null;
    return name === null ? null : { kind: 'unread', name, reach: join.reach };
  }
  const branch = branchStateOf(issue, join.tips, join.conflicts);
  return branch === null ? null : { kind: 'observed', branch };
}
