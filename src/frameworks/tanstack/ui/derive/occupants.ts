import type { ProjectJson } from '~/interface/presenters/sessions/tree.presenter.ts';
import { cut } from '../format.ts';

/* 作業ディレクトリに居るエージェント。

   Git の側は「どのブランチがどこに出ているか」しか言わない。誰がそこで働いているかは
   観測の側にしかないので、cwd で突き合わせる。

   **終わったエージェントは入れない。** Git の画面が答えるのは「いまそこに誰か居るか」で、
   居たことがあるかではない。 */

/** ラベルの最大長。線の行は狭いので、木の一覧より短く切る */
const MAX_LABEL = 20;

/** 並べる順。動いているエージェントを先に出す */
const STATE_ORDER: Readonly<Record<string, number>> = { active: 0, waiting: 1 };

export interface Occupant {
  readonly file: string;
  readonly state: string;
  readonly label: string;
}

export type OccupantIndex = ReadonlyMap<string, readonly Occupant[]>;

export function occupantIndex(project: ProjectJson | undefined): OccupantIndex {
  const index = new Map<string, Occupant[]>();
  if (project === undefined) return index;

  const add = (cwd: string | null, occupant: Occupant) => {
    if (cwd === null || cwd === '' || occupant.state === 'ended') return;
    const found = index.get(cwd) ?? [];
    if (!found.some((other) => other.file === occupant.file)) found.push(occupant);
    index.set(cwd, found);
  };

  for (const session of project.sessions) {
    add(session.cwd, {
      file: session.file,
      state: session.state,
      label: cut(session.title ?? session.id.slice(0, 8), MAX_LABEL),
    });
    for (const subagent of session.subagents) {
      add(subagent.cwd, {
        file: subagent.file,
        state: subagent.state,
        label: cut(subagent.label, MAX_LABEL),
      });
    }
  }
  return index;
}

/* その作業ディレクトリと、その下で働いているエージェント。

   下まで見るのは、エージェントがプロジェクトの中の一段深いところで動くことがあるからである。
   区切りを足して比べるのは、名前の先頭が同じだけの別のパスを拾わないため。 */
export function occupantsOf(index: OccupantIndex, root: string | null): Occupant[] {
  if (root === null || root === '') return [];
  const found: Occupant[] = [];
  for (const [cwd, occupants] of index) {
    if (cwd !== root && !cwd.startsWith(`${root}/`)) continue;
    for (const occupant of occupants) {
      if (!found.some((other) => other.file === occupant.file)) found.push(occupant);
    }
  }
  return found.sort((a, b) => (STATE_ORDER[a.state] ?? 9) - (STATE_ORDER[b.state] ?? 9));
}

/* ブランチの名前で、そこに居るエージェントを引く。

   **cwd だけでは足りない。** worktree を切らずにブランチを渡り歩く使い方では、どの
   セッションも同じ cwd を指すので、全員が本流の行に集まって「誰がどのブランチに居るか」が
   消える。`transcript` はブランチ名も書いているので、そちらでも引けるようにする。 */
export function occupantsOnBranch(
  project: ProjectJson | undefined,
  branch: string,
): readonly Occupant[] {
  if (project === undefined || branch === '') return [];
  const found: Occupant[] = [];
  const add = (name: string | null, occupant: Occupant) => {
    if (name !== branch || occupant.state === 'ended') return;
    if (!found.some((other) => other.file === occupant.file)) found.push(occupant);
  };
  for (const session of project.sessions) {
    add(session.git_branch, {
      file: session.file,
      state: session.state,
      label: cut(session.title ?? session.id.slice(0, 8), MAX_LABEL),
    });
    for (const subagent of session.subagents) {
      add(subagent.git_branch, {
        file: subagent.file,
        state: subagent.state,
        label: cut(subagent.label, MAX_LABEL),
      });
    }
  }
  return found.sort((a, b) => (STATE_ORDER[a.state] ?? 9) - (STATE_ORDER[b.state] ?? 9));
}
