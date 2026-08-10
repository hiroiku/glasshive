import { once } from 'node:events';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { Readable } from 'node:stream';

/* node:http のリクエスト/レスポンスと、サーバーバンドルが扱う `Request`/`Response` を繋ぐ。

   ここはパッケージの中で最も細かい注意が要る場所である。**SSE のようなストリーミング
   レスポンスが詰まるか漏れるかが、この 2 つの関数で決まる。** */

/** node のリクエストを `Request` にする。クライアントが切断したら `signal` で知らせる。 */
export function toRequest(req: IncomingMessage, res: ServerResponse, origin: string): Request {
  const headers = new Headers();
  for (const [key, value] of Object.entries(req.headers)) {
    if (Array.isArray(value)) for (const v of value) headers.append(key, v);
    else if (value !== undefined) headers.set(key, value);
  }

  const hasBody = req.method !== 'GET' && req.method !== 'HEAD';

  /* クライアントが切断したことを、レスポンスを作っている側へ伝える経路。
     これが無いと、ストリーミングレスポンスは相手が居なくなった後もリスナーを掴んだまま残り、
     ブラウザーのタブを開け閉てするたびに溜まっていく。

     **見るのはレスポンスの側であって、リクエストの側ではない。** リクエストの `close` は
     本文を読み終えた時点でも起きるので、そちらを見ると、本文付きのリクエストが自分自身を
     途中で断ち切る。まだ書き終えていないのにレスポンスが閉じたときだけが、本当に切断された
     ときである。 */
  const aborter = new AbortController();
  res.once('close', () => {
    if (!res.writableFinished) aborter.abort();
  });

  return new Request(new URL(req.url ?? '/', origin), {
    method: req.method,
    headers,
    body: hasBody ? (Readable.toWeb(req) as unknown as RequestInit['body']) : undefined,
    // 本文を読みながらレスポンスを返す形。Node の fetch はこれが無いと本文付きを断る
    ...(hasBody ? { duplex: 'half' } : {}),
    signal: aborter.signal,
  } as RequestInit);
}

/** `Response` を node のレスポンスへ書き出す。1 チャンクごとに流す。 */
export async function writeResponse(res: ServerResponse, response: Response): Promise<void> {
  for (const [key, value] of response.headers) res.setHeader(key, value);
  for (const cookie of response.headers.getSetCookie()) res.appendHeader('set-cookie', cookie);
  res.writeHead(response.status);

  /* 先にヘッダーを流す。ストリーミングレスポンスは、最初の 1 バイトが出るまでクライアントからは
     「繋がっていない」のと見分けが付かない。 */
  res.flushHeaders();

  if (response.body === null) {
    res.end();
    return;
  }

  try {
    for await (const chunk of response.body as unknown as AsyncIterable<Uint8Array>) {
      // 溜まったら掃けるまで待つ。待たずに積むと、遅い相手のぶんだけメモリが膨らむ
      if (!res.write(chunk)) await once(res, 'drain');
    }
  } catch {
    /* 途中で切れた。相手が居なくなっただけなので、閉じて終わる */
  }
  res.end();
}
