import type { TreeSnapshotService } from '~/application/services/sessions/tree-snapshot.service.ts';
import { presentTree, type TreeJson } from '~/interface/presenters/sessions/tree.presenter.ts';

/* 木を返す窓。

   枠組みを知らない形にしてある。求めも答えも素の値で、`Request` も `Response` も出てこない。
   繋ぐのは frameworks の側の仕事で、ここは「何を返すか」だけを決める。

   **受理と不受理の分かれ目はここが持つ。** 断りを値のまま外へ流すと、番号に写す役を
   通らずに 200 で出てしまう。断りは断りとして投げ、名札から番号を引く役へ渡す。 */

export async function readTree(snapshot: TreeSnapshotService): Promise<TreeJson> {
  const tree = await snapshot.get();
  if (!tree.ok) throw tree.error;
  return presentTree(tree.value);
}
