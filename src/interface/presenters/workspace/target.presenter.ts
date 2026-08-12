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

/** 名指されたディレクトリを開く先 */
export interface OpenedJson {
  /** 開く URL。同じサーバーの中を指すパスだけで、オリジンは付けない */
  url: string;
}

/* 開く先を組み立てる。**組み立てるのはこちらである** —— 立ち上げに来たコマンドは、
   どのプロジェクトがどの URL に居るかを知らないし、知る必要も無い。

   何も観測できていなければ Overview を開く。名指したディレクトリが指すものがまだ何も
   無いときに、行の無いプロジェクトの画面を出しても、そこには何も出ていない。 */
export const presentOpened = (target: ObservedTarget | null): OpenedJson =>
  target === null || target.projectId === null
    ? { url: '/' }
    : { url: `/projects/${encodeURIComponent(target.projectId)}/work?only=true` };

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
