import type { ProjectJson } from '~/interface/presenters/sessions/tree.presenter.ts';
import { cut, worktreeName } from '../format.ts';

/* 課題の id から「いま誰が・どこで触っているか」を引く索き。

   **台帳には書かれていない。** 書かれているのは assignee という人の申告だけで、
   実際に動いているエージェントとは別物である。だからここは観測の側から突き合わせる —
   会話の中で触れられた課題の id と、作業場所の名前を鍵にする。

   作業場所の名前を鍵に入れるのは、運用の決め事に乗るためである。worktree を課題の id で
   切る使い方が広く行われていて、その名前は正本の cwd に出る。 */

/** 名札の長さ。これより長い名前は、行の幅を食って他の欄を押し出す */
const MAX_LABEL = 24;

export interface Worker {
  readonly file: string;
  readonly kind: 'session' | 'subagent';
  readonly state: string;
  readonly label: string;
  /** 作業場所の名前。持たないなら空 */
  readonly where: string;
}

export type WorkerIndex = ReadonlyMap<string, readonly Worker[]>;

export function workerIndex(project: ProjectJson | undefined): WorkerIndex {
  const index = new Map<string, Worker[]>();
  if (project === undefined) return index;

  const add = (token: string | null, worker: Worker) => {
    if (token === null || token === '') return;
    const found = index.get(token) ?? [];
    // 同じ正本を二度並べない。触れ方が 2 通りあっても、触っているのは 1 人である
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
    }
  }
  return index;
}

/** 生きている手の数。2 つ以上なら、同じ課題を同時に触っている */
export const liveCount = (workers: readonly Worker[]): number =>
  workers.filter((worker) => worker.state !== 'ended').length;
