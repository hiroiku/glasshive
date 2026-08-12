import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import { formatUptime, listed, reportStatus, stopRunning } from '~/frameworks/node/commands.ts';

/* 居場所を訊く求めと、終わらせる求め。

   **サーバーを 1 つに保つと決めた以上、どのターミナルが持っているかを覚えていなくても
   訊けて、止められなければならない。**

   尋ねる範囲はどのテストも自分で渡す。**既定の範囲を探させない** —— その機械で本当に
   動いている glasshive を、テストが見つけて止めてしまう。 */

const servers: http.Server[] = [];

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => new Promise((r) => server.close(r))));
});

/** 立ち上げたばかりの glasshive のふり。終わらせに来られたら本当に閉じる */
async function glasshive(pid: number, uptimeSecs: number, at = 0): Promise<number> {
  const server = http.createServer((req, res) => {
    if (req.url === '/api/quit') {
      setTimeout(() => {
        server.closeAllConnections();
        server.close();
      }, 10);
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ pid }));
      return;
    }
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ app: 'glasshive', dev: false, pid, uptime_s: uptimeSecs }));
  });
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(at, '127.0.0.1', resolve));
  return (server.address() as AddressInfo).port;
}

/** そのポートだけを見る */
const only = (port: number) => ({ first: port, attempts: 1 });

/** 出したものを控える端末 */
function terminal() {
  const lines: string[] = [];
  return { lines, log: (line: string) => lines.push(line) };
}

/* 1 つに保つと決めていても、そう決める前に立ち上げたものや `--port` で別の番号に立てたものが
   残っていることは在る。**1 つだけ言うと、残りは見えないまま動き続ける。** */
describe('見つけたものの並べ方', () => {
  it('2 行目からは頭を空ける', () => {
    expect(listed(['a', 'b', 'c'])).toEqual(['glasshive: a', '           b', '           c']);
  });
});

describe('動いている長さの言い方', () => {
  it('桁を落として読めるようにする', () => {
    expect(formatUptime(0)).toBe('0s');
    expect(formatUptime(42)).toBe('42s');
    expect(formatUptime(90)).toBe('1m');
    expect(formatUptime(8130), '2 時間 15 分半。分より下は要らない').toBe('2h 15m');
    expect(formatUptime(200_000)).toBe('2d 7h');
  });
});

describe('居場所を訊く', () => {
  it('走っていれば、居場所と誰がどれだけ動いているかを言う', async () => {
    const port = await glasshive(4242, 8130);
    const out = terminal();

    expect(await reportStatus(only(port), false, out)).toBe(0);
    expect(out.lines).toEqual([`glasshive: http://127.0.0.1:${port} (pid 4242, up 2h 15m)`]);
  });

  it('2 つ残っていれば、2 つとも言う', async () => {
    const low = await glasshive(11, 5);
    const high = await glasshive(22, 5, low + 1);
    const out = terminal();

    expect(high, '隣のポートで待てなければ、この確かめは成り立たない').toBe(low + 1);
    expect(await reportStatus({ first: low, attempts: 2 }, false, out)).toBe(0);
    expect(out.lines).toEqual([
      `glasshive: http://127.0.0.1:${low} (pid 11, up 5s)`,
      `           http://127.0.0.1:${high} (pid 22, up 5s)`,
    ]);
  });

  /* 走っていないことは誤りではない。**終了コードで分けるのは、これを条件に使う側のためである。** */
  it('走っていなければ、そう言う', async () => {
    const port = await glasshive(1, 1);
    for (const server of servers.splice(0)) server.close();
    const out = terminal();

    expect(await reportStatus(only(port), false, out)).toBe(1);
    expect(out.lines).toEqual(['glasshive: not running']);
  });
});

describe('終わらせる', () => {
  it('走っているものを止めて、止めた相手を言う', async () => {
    const port = await glasshive(4242, 30);
    const out = terminal();

    expect(await stopRunning(only(port), false, out)).toBe(0);
    expect(out.lines).toEqual([`glasshive: stopped http://127.0.0.1:${port} (pid 4242, up 30s)`]);
    expect(
      await reportStatus(only(port), false, terminal()),
      '戻った時点で止まっていなければ、続けて立ち上げ直す人が弾かれる',
    ).toBe(1);
  });

  /* 1 つに保つと言いながら残していけば、止めたはずのものが翌日まだ動いていることになる。 */
  it('残っているものは全部止める', async () => {
    const low = await glasshive(11, 5);
    const high = await glasshive(22, 5, low + 1);
    const range = { first: low, attempts: 2 };
    const out = terminal();

    expect(high, '隣のポートで待てなければ、この確かめは成り立たない').toBe(low + 1);
    expect(await stopRunning(range, false, out)).toBe(0);
    expect(out.lines).toEqual([
      `glasshive: stopped http://127.0.0.1:${low} (pid 11, up 5s)`,
      `           stopped http://127.0.0.1:${high} (pid 22, up 5s)`,
    ]);
    expect(await reportStatus(range, false, terminal()), '1 つも残っていないこと').toBe(1);
  });

  /* 止まっているものを止めようとしたことを誤りにすると、後片付けのスクリプトが毎回そこで転ぶ。 */
  it('走っていなくても、誤りにはしない', async () => {
    const port = await glasshive(1, 1);
    for (const server of servers.splice(0)) server.close();
    const out = terminal();

    expect(await stopRunning(only(port), false, out)).toBe(0);
    expect(out.lines).toEqual(['glasshive: not running']);
  });
});
