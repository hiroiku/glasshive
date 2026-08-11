import type {
  ChangeBroadcastService,
  ChangeMessage,
} from '~/application/services/sessions/change-broadcast.service.ts';

/* 変更通知を、開いたままの接続で配る。

   流すのは SSE のコメント行で、繋がった直後に `: connected`、以降 15 秒ごとに
   `: keep-alive` を送る。ブラウザーの `EventSource` は切れたら自分で繋ぎ直すので、
   再接続の面倒はこちらで持たなくてよい。その代わり、**切断したクライアントの
   リスナーを必ず外す** のはこちらの責任である。 */

const KEEPALIVE_MS = 15_000;

export function openChangeStream(broadcast: ChangeBroadcastService, signal: AbortSignal): Response {
  const encoder = new TextEncoder();
  let release = () => {};

  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      let closed = false;

      const send = (chunk: string) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(chunk));
        } catch {
          // 既に閉じている。以降は書かない
          closed = true;
          release();
        }
      };

      // 繋がったことを先に言う。最初の 1 行が出るまで、ユーザーには「止まっている」のと同じ
      send(': connected\n\n');

      const unsubscribe = broadcast.subscribe((message: ChangeMessage) => {
        send(`data: ${JSON.stringify(message)}\n\n`);
      });

      /* 繋がったことと更新が届くことは別である。ウォッチャーが張れていない機械では、
         この接続は開いたまま何も運ばない — **その 1 つを繋いだ直後に言う**。
         後から死んだ場合は、購読した先へ同じ `watch` が配られてくる */
      const watch: ChangeMessage = {
        kind: 'watch',
        watching: broadcast.watchState().kind === 'observed',
      };
      send(`data: ${JSON.stringify(watch)}\n\n`);
      const beat = setInterval(() => send(': keep-alive\n\n'), KEEPALIVE_MS);

      release = () => {
        closed = true;
        unsubscribe();
        clearInterval(beat);
      };

      if (signal.aborted) {
        release();
        controller.close();
        return;
      }
      signal.addEventListener('abort', () => {
        release();
        try {
          controller.close();
        } catch {
          /* 既に閉じている */
        }
      });
    },
    cancel: () => release(),
  });

  return new Response(body, {
    headers: {
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-cache, no-transform',
      connection: 'keep-alive',
      // 間に何かが挟まったとき、溜めずにそのまま流させる
      'x-accel-buffering': 'no',
    },
  });
}
