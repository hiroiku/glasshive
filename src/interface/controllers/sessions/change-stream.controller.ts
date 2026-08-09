import type {
  ChangeBroadcastService,
  ChangeMessage,
} from '~/application/services/sessions/change-broadcast.service.ts';

/* 動いたという合図を、開いたままの道で配る。

   形は旧実装のまま(先頭に `: connected`、15 秒ごとに `: keep-alive`)。ブラウザーの
   EventSource は切れたら自分で繋ぎ直すので、切断の面倒はこちらで持たなくてよい。
   その代わり、**去った相手の見張りを必ず外す** のはこちらの責任である。 */

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

      // 繋がったことを先に言う。最初の一言が出るまで、観る人には「止まっている」のと同じ
      send(': connected\n\n');

      const unsubscribe = broadcast.subscribe((message: ChangeMessage) => {
        send(`data: ${JSON.stringify(message)}\n\n`);
      });
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
