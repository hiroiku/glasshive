import type { ObservedTarget } from '~/application/use-cases/workspace/observe-target.use-case.ts';

/* 起動のときに名指されたディレクトリを、外部 API が読む形へ写す。

   写すだけである。どのプロジェクトを開くかはもう決まっていて、ここでは決め直さない。

   **名指されていないことは `null` で言う。** Overview を開くのが答えなので、空の欄を並べた
   1 枚を返すと、受け取る側は「名指されたが何も無かった」との区別を持てない。 */

export interface TargetSiblingJson {
  id: string;
  name: string;
  path: string | null;
}

export interface TargetJson {
  /** 打たれたパス。絶対パスに直してある */
  requested_path: string;
  /** リポジトリの根。`git` が答えなければ、打たれたパスそのもの */
  root_path: string;
  name: string;
  /* 開くプロジェクト。**`null` は「まだ何も観測できていない」である** —— 名指したものが
     無かったのではなく、そこに `transcript` がまだ 1 本も無い。 */
  project_id: string | null;
  /** 同じリポジトリに居る、開くもの以外のプロジェクト */
  siblings: TargetSiblingJson[];
}

export const presentTarget = (target: ObservedTarget | null): TargetJson | null =>
  target === null
    ? null
    : {
        requested_path: target.requestedPath,
        root_path: target.rootPath,
        name: target.name,
        project_id: target.projectId,
        siblings: target.siblings.map((sibling) => ({
          id: sibling.id,
          name: sibling.name,
          path: sibling.path,
        })),
      };
