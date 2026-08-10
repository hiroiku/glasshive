import type { TreeSnapshotService } from '~/application/services/sessions/tree-snapshot.service.ts';
import {
  presentIndexTree,
  presentProject,
  presentTree,
  type TreeChunkJson,
  type TreeJson,
} from '~/interface/presenters/sessions/tree.presenter.ts';

/* 木を返すコントローラー。

   `frameworks` を知らない形にしてある。リクエストもレスポンスも素の値で、`Request` も
   `Response` も出てこない。繋ぐのは `frameworks` の側の仕事で、ここは「何を返すか」だけを
   決める。

   **受理と不受理の分かれ目はここが持つ。** 断りを値のまま外へ流すと、HTTP ステータスへ
   写す presenter を通らずに 200 で出てしまう。断りは断りとして投げ、エラーコードから
   ステータスを引く側へ渡す。 */

export async function readTree(snapshot: TreeSnapshotService): Promise<TreeJson> {
  const tree = await snapshot.get();
  if (!tree.ok) throw tree.error;
  return presentTree(tree.value);
}

/* 木を、読めたところから順に返す。

   **断りは最初のチャンクより前にしか投げられない。** 1 つでも配った後は HTTP の
   ステータスが既に決まっているので、そこで投げてもエラーコードから引いた status には
   ならない。索引を取れなかったときの断りは、最初の `yield` の前に出る。 */
export async function* streamTree(
  snapshot: TreeSnapshotService,
): AsyncGenerator<TreeChunkJson, void, void> {
  const stream = snapshot.stream();
  let step = await stream.next();

  /* 索引を配る前に終わっていたなら、覚えている 1 枚がそのまま返っている。**それを丸ごと配る。**

     配らずに `complete` だけを出すと、受け取る側は初期値のまま読み終えたことになり、
     プロジェクトが 1 つも無い木を描く。変更通知が続くあいだは走査と覚えている 1 枚が
     交互に返るので、一覧が出ては消えるのを繰り返す。 */
  if (step.done) {
    if (!step.value.ok) throw step.value.error;
    yield { kind: 'tree', tree: presentTree(step.value.value) };
    yield { kind: 'complete' };
    return;
  }

  while (!step.done) {
    const delta = step.value;
    if (delta.kind === 'index') {
      yield { kind: 'tree', tree: presentIndexTree(delta.index) };
    } else {
      yield {
        kind: 'project',
        project: presentProject(delta.project),
        read_transcripts: delta.readTranscripts,
        total_transcripts: delta.totalTranscripts,
      };
    }
    step = await stream.next();
  }

  if (!step.value.ok) throw step.value.error;
  yield { kind: 'complete' };
}
