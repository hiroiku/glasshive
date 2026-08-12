import { ok, type Result } from '~/app-kernel/result.ts';
import type { TranscriptIndexService } from '~/application/services/sessions/transcript-index.service.ts';
import type { TargetRootService } from '~/application/services/workspace/target-root.service.ts';
import { chooseTarget } from '~/domain/services/workspace/target.service.ts';

/* 名指されたディレクトリが指すプロジェクトを答える。

   起動のときにパスを 1 つ打つと、開くのは Overview ではなくそのリポジトリ 1 つになる。ここが
   答えるのは「どのプロジェクトを開くか」と「同じリポジトリに誰が居るか」だけで、
   **観測してよい範囲は 1 ミリも動かない。** 名指されていてもいなくても、読むのは
   `~/.claude/projects` の全部である。

   索引で足りる。中身を読む前に決まっているのは行の識別だけで、どこを開くかはその識別で
   決まる —— ここで木を組ませると、1 つのリポジトリを開くために全部を読み終える必要が出る。 */

/** 同じリポジトリに居るプロジェクト 1 つ。ウィンドウの上に名前を出す相手である */
export interface TargetSibling {
  readonly id: string;
  readonly name: string;
  readonly path: string | null;
}

export interface ObservedTarget {
  /** 打たれたパス。絶対パスに直してある */
  readonly requestedPath: string;
  /** リポジトリの根。`git` が答えなければ、打たれたパスそのもの */
  readonly rootPath: string;
  readonly name: string;
  /** 開くプロジェクト。名指した場所に何も観測できていなければ `null` */
  readonly projectId: string | null;
  /** 同じリポジトリに居る、開くもの以外のプロジェクト */
  readonly siblings: readonly TargetSibling[];
}

export interface ObserveTargetUseCase {
  /** 名指されていなければ `null`。Overview を開くのが答えである */
  execute(): Promise<Result<ObservedTarget | null>>;
}

export function createObserveTarget(deps: {
  readonly root: TargetRootService;
  readonly index: TranscriptIndexService;
}): ObserveTargetUseCase {
  return {
    async execute() {
      const root = await deps.root.get();
      if (root === null) return ok(null);

      const snapshot = await deps.index.get();
      if (!snapshot.ok) return snapshot;
      const { stubs } = snapshot.value.index;

      const choice = chooseTarget({
        root: root.rootPath,
        worktrees: root.worktrees,
        candidates: stubs.map((stub) => ({
          id: stub.id,
          canonicalPath: stub.canonicalPath,
          latestActivityMs: stub.latestActivityMs,
        })),
      });

      const byId = new Map(stubs.map((stub) => [stub.id, stub]));
      return ok({
        requestedPath: root.requestedPath,
        rootPath: root.rootPath,
        name: root.name,
        projectId: choice.id,
        siblings: choice.others.flatMap((id) => {
          const stub = byId.get(id);
          return stub === undefined ? [] : [{ id, name: stub.name, path: stub.path }];
        }),
      });
    },
  };
}
