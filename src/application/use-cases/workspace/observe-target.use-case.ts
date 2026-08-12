import { ok, type Result } from '~/app-kernel/result.ts';
import type { TranscriptIndexService } from '~/application/services/sessions/transcript-index.service.ts';
import type { NamedDirectoryService } from '~/application/services/workspace/named-directory.service.ts';
import { chooseTarget } from '~/domain/services/workspace/target.service.ts';

/* 名指されたディレクトリが指すプロジェクトを答える。

   名指すのは 2 通りある。起動のときにパスを打つのと、**すでに走っている glasshive へ
   あとから伝える**のである。どちらも同じ判断を通る —— 2 通りの決め方を持つと、同じパスが
   立ち上げ方しだいで別のプロジェクトを開くことになる。

   ここが答えるのは「どのプロジェクトを開くか」と「同じリポジトリに誰が居るか」だけで、
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
  /* パスを渡さなければ、起動のときに名指された相手を見る。どちらも名指されていなければ
     `null` —— Overview を開くのが答えである。 */
  execute(path?: string | null): Promise<Result<ObservedTarget | null>>;
}

export function createObserveTarget(deps: {
  readonly named: NamedDirectoryService;
  readonly index: TranscriptIndexService;
}): ObserveTargetUseCase {
  return {
    async execute(path = null) {
      const root = path === null ? await deps.named.launched() : await deps.named.name(path);
      if (root === null) return ok(null);

      /* 初めて聞いたディレクトリは、索引にまだ載っていない。**載る前に選ぶと、まだ
         `transcript` を 1 本も持たないリポジトリが「観測できていない」になる。** */
      if (path !== null) deps.index.invalidate();

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
