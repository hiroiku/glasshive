import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { treeQueryKey } from '../../queries/tree.query.ts';

/* 正本が動いた合図を受けて、覚えている観測を捨てる。

   **この道具の心臓である。** 観測は時とともに変わり続けるので、遷移のときだけ取り直す
   道の loader では足りない。合図 → 捨てる → 取り直す、という流れがここから始まる。

   `EventSource` を使うのは、切れたときの繋ぎ直しを自分で書かずに済むからである。
   窓を閉じて開き直すたびに繋ぎ直しの仕組みを自作すると、その分だけ間違えられる。

   正本ひとつの追記は、木ではなく開いている会話が要る。木ごと捨てると、
   1 行増えるたびに全部を読み直すことになるので、そちらは別の道で配る。 */

/** 正本ひとつが伸びたことを聞きたい側。会話の窓がここへ登録する */
export type FileListener = (path: string) => void;

const fileListeners = new Set<FileListener>();

export function subscribeToFile(listener: FileListener): () => void {
  fileListeners.add(listener);
  return () => {
    fileListeners.delete(listener);
  };
}

/** 合図の道が繋がっているか。繋がっていないことは観る人に見せる */
export function useChangeStream(): boolean {
  const client = useQueryClient();
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    const source = new EventSource('/api/stream');
    source.onopen = () => setConnected(true);
    /* 切れたことは伝えるが、閉じはしない。`EventSource` が自分で繋ぎ直すので、
       ここで閉じると二度と戻らなくなる。 */
    source.onerror = () => setConnected(false);
    source.onmessage = (message) => {
      let change: unknown;
      try {
        change = JSON.parse(message.data);
      } catch {
        // 読めない合図は合図ではない。捨てて次を待つ
        return;
      }
      if (typeof change !== 'object' || change === null) return;
      const kind = (change as { kind?: unknown }).kind;
      if (kind === 'tree') {
        void client.invalidateQueries({ queryKey: treeQueryKey });
        return;
      }
      if (kind === 'file') {
        const path = (change as { path?: unknown }).path;
        if (typeof path === 'string') for (const listener of fileListeners) listener(path);
      }
    };
    return () => source.close();
  }, [client]);

  return connected;
}
