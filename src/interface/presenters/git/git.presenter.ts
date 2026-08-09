import type { Observation } from '~/app-kernel/observation.ts';
import type { Result } from '~/app-kernel/result.ts';
import type { RefDetail } from '~/application/use-cases/git/observe-ref.use-case.ts';
import type { GitOverview } from '~/application/use-cases/git/observe-repository.use-case.ts';
import {
  type ApiErrorBody,
  type ApiStatus,
  presentError,
} from '~/interface/presenters/api-error.presenter.ts';

/* git の観測を、外の道が読む形へ写す。

   線の引き方は 1 つだけである。**見に行けたが無かったものは誤りではない。**
   そこがリポジトリでない・そんな指しは無い、はどちらも 200 と「無い」で返す。
   404 にすると、記録を読む道具が手元に無いだけの機械で、すべての巣が消えたように見える。

   見に行けなかったとき(道具が無い・権利が無い)だけが誤りで、その写し方は
   `api-error.presenter.ts` の表が決める。 */

/** 見えたか、見に行けたが無かったか。見に行けなかったときはこの形では返らない */
export type GitObservationState = 'observed' | 'absent';

/* 番号と、見分けるための札を両方持つ。

   **見分けるのは `ok` である。** 番号だけで見分けさせると、受け取る側が「200 だが誤り」を
   扱う羽目になる。番号を落とさないのは、記録の窓だけが「無かった」を 200 で返すからで、
   その取り決めをここで言い切っておく必要がある。 */
export type PresentedGit<T> =
  | { ok: true; status: 200; body: T }
  | { ok: false; status: ApiStatus; body: ApiErrorBody };

export interface GitWorktreeJson {
  path: string;
  branch: string | null;
  sha: string | null;
  detached: boolean;
}

export interface GitBranchJson {
  name: string;
  sha: string;
  date: string;
  subject: string;
  head: boolean;
}

export interface GitMainNodeJson {
  sha: string;
  merge: boolean;
  date: string;
  subject: string;
}

export interface GitTipJson {
  kind: 'branch' | 'worktree';
  name: string;
  sha: string;
  date: string | null;
  subject: string;
  worktree: string | null;
  merge_base: string;
  ahead: number;
  behind: number;
}

export interface GitConflictJson {
  a: string;
  b: string;
  /** 両方が触っているファイルの本数 */
  n: number;
  files: string[];
}

export interface GitOverviewJson {
  state: GitObservationState;
  /** 無かったときの言い分。見えたときは無い */
  reason: string | null;
  base: string;
  worktrees: GitWorktreeJson[];
  branches: GitBranchJson[];
  mainline: GitMainNodeJson[];
  tips: GitTipJson[];
  conflicts: GitConflictJson[];
}

export interface GitCommitJson {
  sha: string;
  date: string;
  author: string;
  subject: string;
}

export interface GitDiffFileJson {
  path: string;
  add: number;
  del: number;
}

export interface GitRefLogJson {
  state: GitObservationState;
  reason: string | null;
  rev: string;
  base: string | null;
  unique: boolean;
  commits: GitCommitJson[];
  stat: { files: number; add: number; del: number } | null;
  behind: number;
  files: GitDiffFileJson[];
}

/** 何も見えなかったときの形。欄はすべて在るまま空にする */
const emptyOverview = (reason: string): GitOverviewJson => ({
  state: 'absent',
  reason,
  base: '',
  worktrees: [],
  branches: [],
  mainline: [],
  tips: [],
  conflicts: [],
});

const emptyRefLog = (reason: string): GitRefLogJson => ({
  state: 'absent',
  reason,
  rev: '',
  base: null,
  unique: false,
  commits: [],
  stat: null,
  behind: 0,
  files: [],
});

export function presentGitOverview(
  result: Result<Observation<GitOverview>>,
): PresentedGit<GitOverviewJson> {
  // 形の違う求めは断る。見に行けなかったのではなく、行かないと決めたのである
  if (!result.ok) return { ok: false, ...presentError(result.error) };

  const observation = result.value;
  if (observation.kind === 'unobservable') {
    return { ok: false, ...presentError(observation.error) };
  }
  if (observation.kind === 'absent') {
    return { ok: true, status: 200, body: emptyOverview(observation.reason) };
  }

  const overview = observation.value;
  return {
    ok: true,
    status: 200,
    body: {
      state: 'observed',
      reason: null,
      base: overview.base,
      worktrees: overview.worktrees.map((worktree) => ({
        path: worktree.path,
        branch: worktree.branch,
        sha: worktree.sha,
        detached: worktree.detached,
      })),
      branches: overview.branches.map((branch) => ({
        name: branch.name,
        sha: branch.sha,
        date: branch.date,
        subject: branch.subject,
        head: branch.head,
      })),
      mainline: overview.mainline.map((commit) => ({
        sha: commit.sha,
        merge: commit.merge,
        date: commit.date,
        subject: commit.subject,
      })),
      tips: overview.tips.map((tip) => ({
        kind: tip.kind,
        name: tip.name,
        sha: tip.sha,
        date: tip.date,
        subject: tip.subject,
        worktree: tip.worktree,
        merge_base: tip.mergeBase,
        ahead: tip.ahead,
        behind: tip.behind,
      })),
      conflicts: overview.conflicts.map((conflict) => ({
        a: conflict.a,
        b: conflict.b,
        n: conflict.count,
        files: [...conflict.files],
      })),
    },
  };
}

export function presentRefDetail(
  result: Result<Observation<RefDetail>>,
): PresentedGit<GitRefLogJson> {
  // 形の違う求めは断る。見に行けなかったのではなく、行かないと決めたのである
  if (!result.ok) return { ok: false, ...presentError(result.error) };

  const observation = result.value;
  if (observation.kind === 'unobservable') {
    return { ok: false, ...presentError(observation.error) };
  }
  if (observation.kind === 'absent') {
    return { ok: true, status: 200, body: emptyRefLog(observation.reason) };
  }

  const detail = observation.value;
  return {
    ok: true,
    status: 200,
    body: {
      state: 'observed',
      reason: null,
      rev: detail.rev,
      base: detail.base,
      unique: detail.unique,
      commits: detail.commits.map((commit) => ({
        sha: commit.sha,
        date: commit.date,
        author: commit.author,
        subject: commit.subject,
      })),
      stat: detail.stat === null ? null : { ...detail.stat },
      behind: detail.behind,
      files: detail.files.map((file) => ({
        path: file.path,
        add: file.add,
        del: file.del,
      })),
    },
  };
}
