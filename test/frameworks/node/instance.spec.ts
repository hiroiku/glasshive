import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import { DEFAULTS } from '~/frameworks/node/cli.ts';
import { COMMAND_HEADER, COMMAND_HEADER_VALUE } from '~/frameworks/node/cli-request.ts';
import {
  askGlasshive,
  findAllRunning,
  findRunning,
  isGlasshive,
  openDirectoryAt,
  portsToTry,
  probeGlasshive,
  stopAt,
  surveyRange,
} from '~/frameworks/node/instance.ts';

/* すでに走っている glasshive を見つけて、開きたいディレクトリを伝える。

   **サーバーは 1 つに保つ。** 2 枚目を立ち上げると、走査も索引も `git` の答えも、同じ機械の
   上でもう一度組み直すことになる。ここが「居ない」と答えるたびに、それが起きる。 */

const servers: http.Server[] = [];

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => new Promise((r) => server.close(r))));
});

/** 届いたリクエストを控えながら答える、最小のサーバー */
async function serve(
  handle: (request: { method: string; url: string; body: string }) => {
    status?: number;
    body: string;
    contentType?: string;
  },
  at = 0,
): Promise<{
  origin: string;
  port: number;
  seen: string[];
  headers: http.IncomingHttpHeaders[];
  server: http.Server;
}> {
  const seen: string[] = [];
  const headers: http.IncomingHttpHeaders[] = [];
  const server = http.createServer((req, res) => {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
    });
    req.on('end', () => {
      seen.push(`${req.method} ${req.url} ${body}`);
      headers.push(req.headers);
      const answer = handle({ method: req.method ?? '', url: req.url ?? '', body });
      res.writeHead(answer.status ?? 200, {
        'content-type': answer.contentType ?? 'application/json',
      });
      res.end(answer.body);
    });
  });
  servers.push(server);
  await listen(server, at);
  const { port } = server.address() as AddressInfo;
  return { origin: `http://127.0.0.1:${port}`, port, seen, headers, server };
}

/** 名指したポートで待つ。0 を渡せば空いている番号を借りる */
const listen = (server: http.Server, port: number): Promise<void> =>
  new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', () => resolve());
  });

const health = (body: string, status = 200, at = 0) =>
  serve(({ url }) => (url === '/api/health' ? { status, body } : { status: 404, body: '{}' }), at);

/** 誰も待ち受けていないポート。立ち上げてすぐ閉じ、その番号を借りる */
async function freePort(): Promise<number> {
  const server = http.createServer();
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  await new Promise((resolve) => server.close(resolve));
  return port;
}

/** ポートは握ったまま、何も答えない。**止まっているのとは違う** */
async function silent(at = 0): Promise<{ origin: string; port: number }> {
  const server = http.createServer(() => {
    // 受け取るだけで答えない。握りは解かない
  });
  servers.push(server);
  await listen(server, at);
  const { port } = server.address() as AddressInfo;
  return { origin: `http://127.0.0.1:${port}`, port };
}

/* 尋ねた先が何を答えたか。**無かったのと、観測できなかったのは別である** —— 答えが返らない
   ことは、そこに glasshive が居ないことではない。畳むと、握られたままのポートを空いていると
   言うことになる。 */
describe('尋ねた先の答え', () => {
  it('答えが返らなければ、観測できなかったと言う', { timeout: 20_000 }, async () => {
    const { origin } = await silent();

    expect(await probeGlasshive(origin, false)).toEqual({ kind: 'unobservable' });
  });

  it('誰も待ち受けていなければ、無かったと言う', async () => {
    const port = await freePort();

    expect(await probeGlasshive(`http://127.0.0.1:${port}`, false)).toEqual({ kind: 'absent' });
  });

  /* `/api/health` は I/O を持たない 1 つの `Response.json` なので、そこから 2xx 以外は
     返らない。返ってきたなら、そのポートは別のプログラムが握っている。 */
  it('別のプログラムが答えたなら、無かったと言う', async () => {
    const other = await health('not json at all', 500);

    expect(await probeGlasshive(other.origin, false)).toEqual({ kind: 'absent' });
  });

  /* 立ち上げに来た側は、居ないと答えれば自分で立ち上げる。握られたままのポートならそこで
     待てずに次の空きへ落ちるので、**畳んだことがその場で正される。** */
  it('立ち上げに来た側では、どちらも「居ない」でよい', { timeout: 20_000 }, async () => {
    const { origin } = await silent();

    expect(await askGlasshive(origin, false)).toBeNull();
  });
});

/* 報告するだけの求めは、取りこぼしを自分で正せない。**答えなかったポートを「見つからな
   かった」に混ぜると、そこに居るかどうかを確かめられなかったことが、居ないことになる。** */
describe('範囲を尋ねる', () => {
  it('答えなかったポートを、見つからなかったに混ぜない', { timeout: 20_000 }, async () => {
    const found = await health(
      JSON.stringify({ app: 'glasshive', dev: false, pid: 7, uptime_s: 3 }),
    );
    const quiet = await silent(found.port + 1);

    expect(quiet.port, '2 つが並びで待てなければ、この確かめは成り立たない').toBe(found.port + 1);
    expect(await surveyRange({ first: found.port, attempts: 2 }, false)).toEqual({
      running: [{ origin: found.origin, pid: 7, uptimeSecs: 3 }],
      unobservable: [quiet.origin],
    });
  });
});

describe('そこに居るのが glasshive か', () => {
  it('返ってきた答えが合えば、居ると答える', async () => {
    const { origin } = await health(JSON.stringify({ app: 'glasshive', dev: false }));

    expect(await isGlasshive(origin, false)).toBe(true);
  });

  /* どのターミナルが持っているかを覚えていなくても訊けなければならない。**プロセス id が
     無ければ、見つけたところで `ps` からも辿れない。** */
  it('居場所と、誰がどれだけ動いているかを持ち帰る', async () => {
    const { origin } = await health(
      JSON.stringify({ app: 'glasshive', dev: false, pid: 4242, uptime_s: 8130 }),
    );

    expect(await askGlasshive(origin, false)).toEqual({
      origin,
      pid: 4242,
      uptimeSecs: 8130,
    });
  });

  /* 添え物を答えない glasshive も居る。**使い回せるかどうかは、そこでは変わらない。**
     答えなかった欄は `null` にする —— 0 と書くと、`ps` から辿ろうとした人がそこで止まる。 */
  it('添え物が無くても、居ることは変わらない', async () => {
    const { origin } = await health(JSON.stringify({ app: 'glasshive', dev: false }));

    expect(await askGlasshive(origin, false)).toEqual({ origin, pid: null, uptimeSecs: null });
  });

  /* 開発中の glasshive がビルドされたものを使い回すと、書いたばかりのコードが画面に出ない。
     逆向きも同じで、`glasshive` を打った人に開発中のサーバーを見せることになる。 */
  it('開発中かどうかが違えば、居ないと答える', async () => {
    const { origin } = await health(JSON.stringify({ app: 'glasshive', dev: true }));

    expect(await isGlasshive(origin, false)).toBe(false);
    expect(await isGlasshive(origin, true)).toBe(true);
  });

  it('別のプログラムが答えたら、居ないと答える', async () => {
    const other = await health(JSON.stringify({ app: 'something-else' }));
    const text = await health('<html>hello</html>');
    const refusing = await health('{}', 500);

    expect(await isGlasshive(other.origin, false)).toBe(false);
    expect(await isGlasshive(text.origin, false), '答えを読めないのも、居ないである').toBe(false);
    expect(await isGlasshive(refusing.origin, false)).toBe(false);
  });

  it('誰も待ち受けていなければ、居ないと答える', async () => {
    expect(await isGlasshive(`http://127.0.0.1:${await freePort()}`, false)).toBe(false);
  });
});

describe('使い回せる glasshive を探す', () => {
  it('範囲の中に居れば、その居場所を答える', async () => {
    const { origin, port } = await health(JSON.stringify({ app: 'glasshive', dev: false }));

    expect((await findRunning({ first: port - 2, attempts: 5 }, false))?.origin).toBe(origin);
  });

  /* 何枚も開いている機械では、2 つ以上が同時に走っていることが在る。**採る相手が周ごとに
     変われば、同じコマンドが 2 回目と 3 回目で違うウィンドウを開く。** */
  it('2 つ走っていたら、番号の小さいほうを採る', async () => {
    const body = JSON.stringify({ app: 'glasshive', dev: false });
    const low = await health(body);
    const high = await health(body, 200, low.port + 1);

    expect(high.port, '隣のポートで待てなければ、この確かめは成り立たない').toBe(low.port + 1);
    expect((await findRunning({ first: low.port, attempts: 2 }, false))?.origin).toBe(low.origin);
  });

  /* 1 つに保つと決めていても、そう決める前に立ち上げたものや `--port` で別の番号に立てたものが
     残っていることは在る。**居場所を訊きに来た人に 1 つだけ答えると、残りは見えないまま
     動き続ける。** */
  it('全部を訊かれたら、番号の順に全部並べる', async () => {
    const body = JSON.stringify({ app: 'glasshive', dev: false });
    const low = await health(body);
    const high = await health(body, 200, low.port + 1);

    expect(high.port, '隣のポートで待てなければ、この確かめは成り立たない').toBe(low.port + 1);
    expect(
      (await findAllRunning({ first: low.port, attempts: 2 }, false)).map((one) => one.origin),
    ).toEqual([low.origin, high.origin]);
  });

  it('範囲の外に居ても、見つけない', async () => {
    const { port } = await health(JSON.stringify({ app: 'glasshive', dev: false }));

    expect(await findRunning({ first: port + 1, attempts: 1 }, false)).toBe(null);
  });

  /* 探す先と待ち受ける先は同じ範囲でなければならない。片方だけを広げると、走っている
     glasshive を見落として 2 枚目が立ち上がる。 */
  it('名指されたポートだけを見る。既定のときだけ先へ探す', () => {
    expect(portsToTry(5000)).toEqual({ first: 5000, attempts: 1 });
    expect(portsToTry(undefined).first).toBe(DEFAULTS.port);
    expect(portsToTry(undefined).attempts).toBeGreaterThan(1);
  });
});

describe('開きたいディレクトリを伝える', () => {
  it('答えられた URL を、そのまま開く先にする', async () => {
    const { origin, seen, headers } = await serve(() => ({
      body: JSON.stringify({ url: '/projects/the-repo/work?only=true' }),
    }));

    expect(await openDirectoryAt(origin, '/src/repo')).toBe(
      `${origin}/projects/the-repo/work?only=true`,
    );
    expect(seen, '開く先を組み立てるのは、索引を持っている側である').toEqual([
      'POST /api/open {"path":"/src/repo"}',
    ]);
    expect(
      headers[0]?.[COMMAND_HEADER],
      'コマンドから来たことを伝えずに送ると、伝えた先はブラウザーと見分けられずに断る',
    ).toBe(COMMAND_HEADER_VALUE);
  });

  it('ディレクトリを名指していなければ、何も伝えずに Overview を開く', async () => {
    const { origin, seen } = await serve(() => ({ body: '{}' }));

    expect(await openDirectoryAt(origin, undefined)).toBe(origin);
    expect(seen).toEqual([]);
  });

  /* 断られたことを黙って飲み込むと、打った相手とは違うものが開いて終わる。 */
  it('断られたら、その理由をそのまま伝える', async () => {
    const { origin } = await serve(() => ({
      status: 403,
      body: JSON.stringify({ state: 'invalid', code: 'x', message: 'not allowed here' }),
    }));

    await expect(openDirectoryAt(origin, '/src/repo')).rejects.toThrow('not allowed here');
  });

  it('答えを読めなければ、開く先が無いことにする', async () => {
    const { origin } = await serve(() => ({ body: 'not json' }));

    await expect(openDirectoryAt(origin, '/src/repo')).rejects.toThrow('/src/repo');
  });
});

describe('走っているものを終わらせる', () => {
  /* 答えが返っただけでは、まだポートを握っている。**握りが解けるまで待つ** —— 止めた直後に
     立ち上げ直す人が、自分が止めたサーバーに弾かれる。 */
  it('握りが解けるのを見届けてから戻る', async () => {
    let close: (() => void) | undefined;
    const scene = await serve(() => {
      setTimeout(() => close?.(), 10);
      return { body: JSON.stringify({ pid: 4242 }) };
    });
    close = () => {
      scene.server.closeAllConnections();
      scene.server.close();
    };

    await stopAt({ origin: scene.origin, pid: 4242, uptimeSecs: 10 });

    expect(scene.seen).toEqual(['POST /api/quit ']);
    expect(
      scene.headers[0]?.[COMMAND_HEADER],
      '伝えずに送ると、終わらせに来たのがブラウザーと見分けられずに断られる',
    ).toBe(COMMAND_HEADER_VALUE);
    expect(await isGlasshive(scene.origin, false), '戻った時点で、そこはもう空いている').toBe(
      false,
    );
  });

  it('断られたら、その理由をそのまま伝える', async () => {
    const { origin } = await serve(() => ({
      status: 403,
      body: JSON.stringify({ state: 'invalid', code: 'x', message: 'not allowed here' }),
    }));

    await expect(stopAt({ origin, pid: 0, uptimeSecs: 0 })).rejects.toThrow('not allowed here');
  });
});
