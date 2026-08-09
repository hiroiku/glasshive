import { once } from 'node:events';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { Readable } from 'node:stream';

/* node:http の求め/答えと、束ね役が話す Request/Response を繋ぐ。

   ここは配りものの中で最も細かい注意が要る場所である。**届き続ける答え(SSE)が
   詰まるか漏れるかが、この 2 つの関数で決まる。** */

/** node の求めを Request にする。観る人が去ったら signal で知らせる。 */
export function toRequest(req: IncomingMessage, res: ServerResponse, origin: string): Request {
  const headers = new Headers();
  for (const [key, value] of Object.entries(req.headers)) {
    if (Array.isArray(value)) for (const v of value) headers.append(key, v);
    else if (value !== undefined) headers.set(key, value);
  }

  const hasBody = req.method !== 'GET' && req.method !== 'HEAD';

  /* 観る人が去ったことを、答えを作っている側へ伝える道。
     これが無いと、届き続ける答えは相手の居なくなった後も見張りを掴んだまま残り、
     窓を開け閉てするたびに増えていく。

     **見るのは答えの側であって、求めの側ではない。** 求めの `close` は本文を読み終えた
     時点でも起きるので、そちらを見ると、本文付きの求めが自分自身を途中で断ち切る。
     まだ書き終えていないのに答えが閉じたときだけが、本当に相手の去ったときである。 */
  const aborter = new AbortController();
  res.once('close', () => {
    if (!res.writableFinished) aborter.abort();
  });

  return new Request(new URL(req.url ?? '/', origin), {
    method: req.method,
    headers,
    body: hasBody ? (Readable.toWeb(req) as unknown as RequestInit['body']) : undefined,
    // 本文を読みながら答えを返す形。Node の fetch はこれが無いと本文付きを断る
    ...(hasBody ? { duplex: 'half' } : {}),
    signal: aborter.signal,
  } as RequestInit);
}

/** Response を node の答えへ書き出す。1 かたまりごとに流す。 */
export async function writeResponse(res: ServerResponse, response: Response): Promise<void> {
  for (const [key, value] of response.headers) res.setHeader(key, value);
  for (const cookie of response.headers.getSetCookie()) res.appendHeader('set-cookie', cookie);
  res.writeHead(response.status);

  /* 先に頭を流す。届き続ける答えは、最初の一言が出るまで観る人には
     「繋がっていない」のと見分けが付かない。 */
  res.flushHeaders();

  if (response.body === null) {
    res.end();
    return;
  }

  try {
    for await (const chunk of response.body as unknown as AsyncIterable<Uint8Array>) {
      // 溜まったら掃けるまで待つ。待たずに積むと、遅い相手のぶんだけ覚えが膨らむ
      if (!res.write(chunk)) await once(res, 'drain');
    }
  } catch {
    /* 途中で切れた。相手が居なくなっただけなので、閉じて終わる */
  }
  res.end();
}
