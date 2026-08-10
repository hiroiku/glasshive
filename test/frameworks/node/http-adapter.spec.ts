import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import { toRequest, writeResponse } from '~/frameworks/node/http-adapter.ts';

/* ランチャーとサーバーバンドルの繋ぎ目。

   ここが歪むと、内側がどれだけ正しくても外から使えない。しかも歪みは
   組み上げてからでないと出ないので、画面を触るまで誰も気付けない。 */

let server: http.Server | undefined;

afterEach(async () => {
  if (server === undefined) return;
  await new Promise((resolve) => server?.close(resolve));
  server = undefined;
});

/** リクエストを渡された処理へ繋ぐだけの、最小のサーバー */
async function serve(handle: (request: Request) => Promise<Response>): Promise<string> {
  server = http.createServer((req, res) => {
    void (async () => {
      await writeResponse(res, await handle(toRequest(req, res, 'http://127.0.0.1')));
    })();
  });
  await new Promise<void>((resolve) => server?.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  return `http://127.0.0.1:${port}`;
}

describe('リクエストを Request に写す', () => {
  /* 本文を読み終えたことを「クライアントが切断した」と読むと、本文付きのリクエストが
     自分自身を途中で断ち切る。ピン留めがどう頑張っても置けなくなる。 */
  it('本文を読み終えても、途中で断ち切らない', async () => {
    const origin = await serve(async (request) => {
      const text = await request.text();
      // 本文を読み切った後にも仕事が続く。ここで signal が立っていれば、それが歪みである
      await new Promise((resolve) => setTimeout(resolve, 30));
      if (request.signal.aborted) return new Response('断ち切られた', { status: 500 });
      return new Response(text, { status: 200 });
    });

    const response = await fetch(origin, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action: 'pin', id: '-w-a' }),
    });

    expect(response.status, 'リクエスト側の閉じは、切断ではない').toBe(200);
    expect(await response.text(), '本文は最後まで届いていること').toBe(
      '{"action":"pin","id":"-w-a"}',
    );
  });

  it('本文の無いリクエストも、そのまま通す', async () => {
    const origin = await serve(async (request) => {
      await new Promise((resolve) => setTimeout(resolve, 30));
      return new Response(request.signal.aborted ? '断ち切られた' : 'ok', {
        status: 200,
      });
    });

    expect(await (await fetch(origin)).text()).toBe('ok');
  });

  /* SSE のレスポンスは、クライアントが切断したことを知らなければ止まらない。知らせる手段が
     無いと、リスナーを掴んだまま残り、接続を開け閉てするたびに増えていく。 */
  it('クライアントが切断したら、レスポンスを作っている側へ知らせる', async () => {
    let aborted: Promise<void> | undefined;
    const origin = await serve(async (request) => {
      aborted = new Promise<void>((resolve) => {
        request.signal.addEventListener('abort', () => resolve());
      });
      // 終わらないレスポンス。相手が去るまで閉じない
      return new Response(new ReadableStream({ start: (c) => c.enqueue(new Uint8Array([58])) }), {
        headers: { 'content-type': 'text/event-stream' },
      });
    });

    const controller = new AbortController();
    const response = await fetch(origin, { signal: controller.signal });
    await response.body?.getReader().read();
    controller.abort();

    await expect(
      Promise.race([
        aborted,
        new Promise((_, reject) => setTimeout(() => reject(new Error('知らせが来ない')), 3000)),
      ]),
      '知らせが来ないと、切断した相手のぶんのリスナーが残り続ける',
    ).resolves.toBeUndefined();
  });

  it('`Host` ヘッダーをそのまま渡す', async () => {
    const origin = await serve(async (request) =>
      Response.json({ host: request.headers.get('host') }),
    );
    const url = new URL(origin);

    const seen = await new Promise<string>((resolve) => {
      const request = http.request(
        {
          host: url.hostname,
          port: url.port,
          path: '/',
          headers: { Host: 'evil.example' },
        },
        (res) => {
          let body = '';
          res.on('data', (chunk) => {
            body += chunk;
          });
          res.on('end', () => resolve(JSON.parse(body).host));
        },
      );
      request.end();
    });

    expect(seen, 'Host を検証する側は、届いた文字列そのものを見られなければならない').toBe(
      'evil.example',
    );
  });
});
