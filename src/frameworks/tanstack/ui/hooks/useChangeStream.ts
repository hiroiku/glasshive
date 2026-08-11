import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { treeQueryKey } from '../../queries/tree.query.ts';

/* `transcript` が動いた変更通知を受けて、覚えている観測を捨てる。

   **glasshive の心臓である。** 観測は時とともに変わり続けるので、遷移のときだけ取り直す
   ルートの loader では足りない。変更通知 → 捨てる → 取り直す、という流れがここから始まる。

   `EventSource` を使うのは、切れたときの繋ぎ直しを自分で書かずに済むからである。
   接続が切れて繋ぎ直るたびの手当てを自作すると、その分だけ間違えられる。

   `transcript` 1 つへの追記は、木ではなく開いている会話が要る。木ごと捨てると、
   1 行増えるたびに全部を読み直すことになるので、そちらは別の経路で配る。 */

/** `transcript` 1 つに追記されたことを聞きたい側。会話のパネルがここへ登録する */
export type FileListener = (path: string) => void;

const fileListeners = new Set<FileListener>();

export function subscribeToFile(listener: FileListener): () => void {
  fileListeners.add(listener);
  return () => {
    fileListeners.delete(listener);
  };
}

/* 変更通知がユーザーへ届く条件は 2 つあり、**どちらが欠けても更新は来ない**。
   SSE が開いていること(`connected`)と、サーバーがウォッチャーを張れていること
   (`watching`)である。片方だけを見せると、繋がっている限り健全に見えてしまう。 */
export interface ChangeStreamState {
  /** 変更通知の SSE が繋がっているか */
  readonly connected: boolean;
  /** サーバーがウォッチャーを張れているか。`false` なら、繋がっていても更新は届かない */
  readonly watching: boolean;
}

/** 変更通知の届き方。届いていないことはユーザーに見せる */
export function useChangeStream(): ChangeStreamState {
  const client = useQueryClient();
  const [connected, setConnected] = useState(false);
  /* サーバーが張れていないと言ってくるまでは、張れているものとして扱う。繋がる前から
     「更新は届かない」と出すと、画面を開いた一瞬だけ必ずそう見える */
  const [watching, setWatching] = useState(true);

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
        // 読めない変更通知は変更通知ではない。捨てて次を待つ
        return;
      }
      if (typeof change !== 'object' || change === null) return;
      const kind = (change as { kind?: unknown }).kind;
      if (kind === 'tree') {
        /* **走っている取り直しを打ち切らない。** 木はストリームで届くので、既定のように
           打ち切ると、最初の走査の途中で `transcript` が 1 本書かれただけでそこまでの
           途中経過が捨てられ、止まった数のまま画面が残る。走らせきってから取り直す。 */
        void client.invalidateQueries({ queryKey: treeQueryKey }, { cancelRefetch: false });
        return;
      }
      if (kind === 'file') {
        const path = (change as { path?: unknown }).path;
        if (typeof path === 'string') for (const listener of fileListeners) listener(path);
        return;
      }
      if (kind === 'watch') {
        const alive = (change as { watching?: unknown }).watching;
        if (typeof alive === 'boolean') setWatching(alive);
      }
    };
    return () => source.close();
  }, [client]);

  return useMemo(() => ({ connected, watching }), [connected, watching]);
}
