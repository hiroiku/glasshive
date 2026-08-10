import type { IssueSummaryJson } from '~/interface/presenters/issues/issues.presenter.ts';
import type { ProjectJson } from '~/interface/presenters/sessions/tree.presenter.ts';
import { cut, worktreeName } from '../format.ts';

/* 課題の id から「いま誰が・どこで触っているか」を引くインデックス。

   **台帳には書かれていない。** 書かれているのは assignee という人の申告だけで、
   実際に動いているエージェントとは別物である。だからここは観測の側から突き合わせる —
   会話の中で触れられた課題の id、worktree の名前、そして git のブランチ名をキーにする。

   worktree の名前とブランチ名をキーに入れるのは、運用の決め事に乗るためである。worktree や
   ブランチを課題の id で切る使い方が広く行われていて、どちらも `transcript` に出る。
   ブランチ名は GitHub の PR の `head_ref_name` とも突き合わせられる —— 課題の id が会話に
   一度も出なくても、その課題を閉じる PR のブランチで動いていれば、それは同じ作業である。 */

/** ラベルの最大長。これより長い名前は、行の幅を食って他の欄を押し出す */
const MAX_LABEL = 24;

export interface Worker {
  readonly file: string;
  readonly kind: 'session' | 'subagent';
  readonly state: string;
  readonly label: string;
  /** worktree の名前。持たないなら空 */
  readonly where: string;
}

/** どの鍵で見つかったか。`branch` は PR のブランチ越し —— 課題の id では繋がっていない */
export type WorkerVia = 'issue' | 'branch';

export interface MatchedWorker extends Worker {
  readonly via: WorkerVia;
  /** ブランチ越しに見つけたときの PR 番号。id で見つけたなら `null` */
  readonly pull: number | null;
}

export type WorkerIndex = ReadonlyMap<string, readonly Worker[]>;

export function workerIndex(project: ProjectJson | undefined): WorkerIndex {
  const index = new Map<string, Worker[]>();
  if (project === undefined) return index;

  const add = (token: string | null, worker: Worker) => {
    if (token === null || token === '') return;
    const found = index.get(token) ?? [];
    // 同じ `transcript` を二度並べない。触れ方が 2 通りあっても、触っているのは 1 人である
    if (!found.some((other) => other.file === worker.file)) found.push(worker);
    index.set(token, found);
  };

  for (const session of project.sessions) {
    const worker: Worker = {
      file: session.file,
      kind: 'session',
      state: session.state,
      label: cut(session.title ?? session.id.slice(0, 8), MAX_LABEL),
      where: worktreeName(session.cwd),
    };
    for (const id of session.issues) add(id, worker);
    add(worker.where, worker);
    add(session.git_branch, worker);

    for (const subagent of session.subagents) {
      const child: Worker = {
        file: subagent.file,
        kind: 'subagent',
        state: subagent.state,
        label: cut(subagent.label, MAX_LABEL),
        where: worktreeName(subagent.cwd),
      };
      add(subagent.issue, child);
      add(child.where, child);
      add(subagent.git_branch, child);
    }
  }
  return index;
}

/* 1 件の課題を触っているワーカーを、鍵を全部使って引く。

   **id で引けたものを先に置く。** 同じ `transcript` が id とブランチの両方で引けることが
   あり、そのときは id のほうが強い証拠である —— 会話の中でその課題を名指ししている。 */
export function workersOn(
  index: WorkerIndex,
  issue: Pick<IssueSummaryJson, 'id' | 'github'>,
): readonly MatchedWorker[] {
  const found: MatchedWorker[] = (index.get(issue.id ?? '') ?? []).map((worker) => ({
    ...worker,
    via: 'issue',
    pull: null,
  }));

  for (const pull of issue.github?.pull_requests ?? []) {
    for (const worker of index.get(pull.head_ref_name ?? '') ?? []) {
      if (found.some((other) => other.file === worker.file)) continue;
      found.push({ ...worker, via: 'branch', pull: pull.number });
    }
  }
  return found;
}

/** 生きているワーカーの数。2 つ以上なら、同じ課題を同時に触っている */
export const liveCount = (workers: readonly Worker[]): number =>
  workers.filter((worker) => worker.state !== 'ended').length;

/* ブランチ越しに見つけた訳。**id で見つけたものには何も添えない** ——
   会話の中で課題を名指ししているのだから、そこに説明は要らない。 */
export const viaLabel = (worker: MatchedWorker): string | null =>
  worker.via === 'branch' && worker.pull !== null ? `on the branch of PR #${worker.pull}` : null;
