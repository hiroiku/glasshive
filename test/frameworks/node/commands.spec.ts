import http from 'node:http';
import net, { type AddressInfo } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import {
  describe as describeInstance,
  formatUptime,
  listed,
  reportStatus,
  runCommand,
  stopRunning,
} from '~/frameworks/node/commands.ts';
import { stopAt } from '~/frameworks/node/instance.ts';

/* 居場所を訊く求めと、終わらせる求め。

   **サーバーを 1 つに保つと決めた以上、どのターミナルが持っているかを覚えていなくても
   訊けて、止められなければならない。**

   尋ねる範囲はどのテストも自分で渡す。**既定の範囲を探させない** —— その機械で本当に
   動いている glasshive を、テストが見つけて止めてしまう。 */

const servers: net.Server[] = [];

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

/* 出したものを控える端末。**stdout と stderr を分けて持つ** —— 走っていないことは答えで
   stdout に出るが、観測できなかったことは誤りなので stderr に出る。 */
function terminal() {
  const lines: string[] = [];
  const errors: string[] = [];
  return {
    lines,
    errors,
    log: (line: string) => lines.push(line),
    error: (line: string) => errors.push(line),
  };
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

/** 開発中の glasshive のふり。ビルドしたものとは別に数えられる側である */
async function devGlasshive(pid: number, at = 0): Promise<number> {
  const server = http.createServer((_req, res) => {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ app: 'glasshive', dev: true, pid, uptime_s: 60 }));
  });
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(at, '127.0.0.1', resolve));
  return (server.address() as AddressInfo).port;
}

/* 開発中のものとビルドしたものは別に数える。**片方から見て居ないのは、居ないことではない。** */
describe('こちらの側に居ないだけのとき', () => {
  it('もう片方が握っていることを言い、止め方まで言う', async () => {
    const port = await devGlasshive(78618);
    const out = terminal();

    expect(await reportStatus(only(port), false, out), 'こちらの側には居ない').toBe(1);
    expect(out.lines).toEqual([
      'glasshive: not running',
      `           a development glasshive is at http://127.0.0.1:${port} (pid 78618, up 1m)`,
      '           stop it with `npm run dev -- --stop`',
    ]);
  });

  /* `--stop` は 0 で終わる。**それでも黙らない** —— 走っているものが残ったまま「止めた」と
     読まれると、既定のポートを握られていることに気付けない。 */
  it('止めに来ても、残っているものを黙って見送らない', async () => {
    const port = await devGlasshive(78618);
    const out = terminal();

    expect(await stopRunning(only(port), false, out)).toBe(0);
    expect(out.lines[1]).toContain('a development glasshive is at');
  });

  it('本当に 1 つも居なければ、それだけを言う', async () => {
    const port = await glasshive(1, 1);
    for (const server of servers.splice(0)) server.close();
    const out = terminal();

    expect(await reportStatus(only(port), false, out)).toBe(1);
    expect(out.lines, '居ないものの止め方を案内しない').toEqual(['glasshive: not running']);
  });
});

/** 止めに来られたら断る glasshive。何を言って断るかまで決められる */
async function refuses(pid: number, message: string, at = 0): Promise<number> {
  const server = http.createServer((req, res) => {
    if (req.url === '/api/quit') {
      res.writeHead(500, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ message }));
      return;
    }
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ app: 'glasshive', dev: false, pid, uptime_s: 5 }));
  });
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(at, '127.0.0.1', resolve));
  return (server.address() as AddressInfo).port;
}

/* 途中で止まらなくなったとき、**止めたものだけを言うと、もう一度打つべきかが決まらない。** */
describe('途中で止められなかったとき', () => {
  it('止めそこねた相手と、まだ尋ねていない相手を名指す', async () => {
    const first = await glasshive(11, 5);
    const stuck = await refuses(22, 'boom', first + 1);
    const last = await glasshive(33, 5, first + 2);
    const out = terminal();

    expect([stuck, last], '3 つが並びで待てなければ、この確かめは成り立たない').toEqual([
      first + 1,
      first + 2,
    ]);
    await expect(stopRunning({ first, attempts: 3 }, false, out)).rejects.toThrow('boom');
    expect(out.lines).toEqual([
      `glasshive: stopped http://127.0.0.1:${first} (pid 11, up 5s)`,
      `           could not stop http://127.0.0.1:${stuck}`,
      `           still running, not asked: http://127.0.0.1:${last}`,
    ]);
  });

  /* ここで投げて終わると、答えなかったポートは一度も名指されないまま消える。**決まって
     いないものを 1 つでも落とすと、残りが読めない。** */
  it('答えなかったポートも、そこで一緒に名指す', { timeout: 20_000 }, async () => {
    const first = await glasshive(11, 5);
    const stuck = await refuses(22, 'boom', first + 1);
    const quiet = await silent(first + 2);
    const out = terminal();

    expect([stuck, quiet], '3 つが並びで待てなければ、この確かめは成り立たない').toEqual([
      first + 1,
      first + 2,
    ]);
    await expect(stopRunning({ first, attempts: 3 }, false, out)).rejects.toThrow('boom');
    expect(out.lines).toEqual([
      `glasshive: stopped http://127.0.0.1:${first} (pid 11, up 5s)`,
      `           could not stop http://127.0.0.1:${stuck}`,
      `           could not tell whether glasshive is at http://127.0.0.1:${quiet} — something holds that port and did not answer in time; use --port to look at one port only`,
    ]);
  });
});

/** そのポートを握ったまま、別の場所へ寄越す何か。glasshive ではない */
async function redirects(to: string): Promise<number> {
  const server = http.createServer((_req, res) => {
    res.writeHead(307, { location: to });
    res.end();
  });
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  return (server.address() as AddressInfo).port;
}

/* 転送先を追うと、答えた相手と尋ねた先が別になる。**自己申告も `pid` も、好きな所から
   持って来られることになる。** */
describe('転送先は追わない', () => {
  it('寄越された先の自己申告を、そのポートのものとして言わない', async () => {
    const real = await glasshive(66666, 60);
    const rogue = await redirects(`http://127.0.0.1:${real}/api/health`);
    const out = terminal();

    expect(await reportStatus(only(rogue), false, out), 'glasshive は居ない').toBe(1);
    expect(out.lines).toEqual(['glasshive: not running']);
  });
});

/** 止めに来られたら承知して、そのあと答えなくなる。ただしポートは握ったままである */
async function goesQuiet(pid: number): Promise<number> {
  let quiet = false;
  const server = http.createServer((req, res) => {
    if (req.url === '/api/quit') {
      quiet = true;
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ pid }));
      return;
    }
    // 答えないだけで、握りは解かない
    if (quiet) return;
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ app: 'glasshive', dev: false, pid, uptime_s: 5 }));
  });
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  return (server.address() as AddressInfo).port;
}

/* 見届けるのは、答えが返ることではなくポートが空くことである。**答えなくなっただけで握った
   ままなら、それは止まらなかったということで、こちらはそれを観測できる。** 「止めた」と言うと、
   立ち上げ直した人が自分で止めたはずのサーバーに弾かれる。 */
describe('答えなくなっても、握ったままのとき', () => {
  it('止めたとは言わず、止まらなかったと言う', { timeout: 20_000 }, async () => {
    const port = await goesQuiet(44);
    const out = terminal();

    await expect(stopRunning(only(port), false, out)).rejects.toThrow(
      `http://127.0.0.1:${port} did not stop`,
    );
    expect(out.lines, '止めたとは言わない').toEqual([
      `glasshive: could not stop http://127.0.0.1:${port}`,
    ]);
  });
});

/** ポートは握ったまま、何も答えない。**止まっているのとは違う** */
async function silent(at = 0): Promise<number> {
  const server = http.createServer(() => {
    // 受け取るだけで答えない。握りは解かない
  });
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(at, '127.0.0.1', resolve));
  return (server.address() as AddressInfo).port;
}

/* 報告するだけの求めは、取りこぼしを自分で正せない。立ち上げに来た側なら「居ない」と読んで
   自分で立ち上げ、そこで待てずに次の空きへ落ちるので畳んだことがその場で正される。**尋ねて
   終わるだけの求めには、その先が無い。** */
describe('確かめられなかったとき', () => {
  it('走っていないとは言わない', { timeout: 20_000 }, async () => {
    const port = await silent();
    const out = terminal();

    await expect(reportStatus(only(port), false, out)).rejects.toThrow(
      `could not tell whether glasshive is at http://127.0.0.1:${port} — something holds that port and did not answer in time`,
    );
    expect(out.lines, '「走っていない」を出さない').toEqual([]);
  });

  /* 既定の範囲は 20 個あるので、glasshive でないものが 1 つ居るだけでこの行が出る。**そこで
     終わらせず、次に何をすればよいかまで言う。** */
  it('範囲を探したときは、絞り方まで言う', { timeout: 20_000 }, async () => {
    const port = await silent();

    await expect(reportStatus({ first: port, attempts: 2 }, false, terminal())).rejects.toThrow(
      'use --port to look at one port only',
    );
  });

  /* もう `--port` を打った人にそれを勧めても、次にすることが増えない。 */
  it('ポートを名指して来た人には、それを勧めない', { timeout: 20_000 }, async () => {
    const port = await silent();

    await expect(reportStatus(only(port), false, terminal())).rejects.toThrow(
      /did not answer in time$/,
    );
  });

  /* ここが 0 で終わると、後片付けのスクリプトはポートが空いたものとして次へ進み、
     握ったままの glasshive に弾かれる。 */
  it('止めたことにして 0 で終わらない', { timeout: 20_000 }, async () => {
    const port = await silent();
    const out = terminal();

    await expect(stopRunning(only(port), false, out)).rejects.toThrow('could not tell whether');
    expect(out.lines, '止めたとは言わない').toEqual([]);
  });

  /* 1 つ見つけたことは、そこだけしか居ないことの証しにはならない。 */
  it('見つけたものが在っても、答えなかったポートを添える', { timeout: 20_000 }, async () => {
    const found = await glasshive(99, 5);
    const quiet = await silent(found + 1);
    const out = terminal();

    expect(quiet, '2 つが並びで待てなければ、この確かめは成り立たない').toBe(found + 1);
    expect(await reportStatus({ first: found, attempts: 2 }, false, out)).toBe(0);
    expect(out.lines).toEqual([
      `glasshive: http://127.0.0.1:${found} (pid 99, up 5s)`,
      `           could not tell whether glasshive is at http://127.0.0.1:${quiet} — something holds that port and did not answer in time; use --port to look at one port only`,
    ]);
  });
});

/* 答えなかった欄を作り話で埋めない。**片方だけ答えた glasshive から、答えたほうまで
   落とさない。** */
describe('見つけたものの言い表し方', () => {
  const at = 'http://127.0.0.1:4483';

  it('答えた欄だけを書く', () => {
    expect(describeInstance({ origin: at, pid: 12, uptimeSecs: 90 })).toBe(`${at} (pid 12, up 1m)`);
    expect(describeInstance({ origin: at, pid: null, uptimeSecs: 90 })).toBe(`${at} (up 1m)`);
    expect(describeInstance({ origin: at, pid: 12, uptimeSecs: null })).toBe(`${at} (pid 12)`);
    expect(describeInstance({ origin: at, pid: null, uptimeSecs: null })).toBe(at);
  });
});

/* ランチャーと開発用のスクリプトで、同じ引数が違う意味になってはいけない。**それぞれで
   書くと、片方だけが失敗を捕まえるといった食い違いが黙って入る。** */
describe('尋ねて終わるだけの求めを実行する', () => {
  it('尋ねる求めでなければ、何もせずに譲る', async () => {
    expect(await runCommand({ action: 'serve', port: undefined }, false, terminal())).toBeNull();
  });

  it('見つかったものを stdout に出して 0 で終わる', async () => {
    const port = await glasshive(31, 5);
    const out = terminal();

    expect(await runCommand({ action: 'status', port }, false, out)).toBe(0);
    expect(out.lines).toEqual([`glasshive: http://127.0.0.1:${port} (pid 31, up 5s)`]);
    expect(out.errors).toEqual([]);
  });

  it('確かめられなかったことは stderr に出して 1 で終わる', { timeout: 20_000 }, async () => {
    const port = await silent();
    const out = terminal();

    expect(await runCommand({ action: 'stop', port }, false, out)).toBe(1);
    expect(out.lines, '答えとしては何も出さない').toEqual([]);
    expect(out.errors).toEqual([
      `glasshive: could not tell whether glasshive is at http://127.0.0.1:${port} — something holds that port and did not answer in time`,
    ]);
  });
});

/** 止めに来られたら受け取るが、答えない。**ポートは握ったままである** */
async function swallowsQuit(pid: number): Promise<number> {
  const server = http.createServer((req, res) => {
    // 受け取るだけで答えない
    if (req.url === '/api/quit') return;
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ app: 'glasshive', dev: false, pid, uptime_s: 5 }));
  });
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  return (server.address() as AddressInfo).port;
}

/* 止める求めにも待つ時間を区切る。**区切らないと、受け取っておいて答えないサーバーを相手に
   `--stop` が終わらない。** 止まらないものを待ち続けるより、待ったことを言って終わる。 */
describe('止める求めに答えが返らないとき', () => {
  it('待ち続けずに、分からなかったと言う', { timeout: 20_000 }, async () => {
    const port = await swallowsQuit(55);
    const out = terminal();

    await expect(stopRunning(only(port), false, out)).rejects.toThrow(
      `could not tell whether http://127.0.0.1:${port} stopped`,
    );
    expect(out.lines, '止めたとは言わない').toEqual([
      `glasshive: could not stop http://127.0.0.1:${port}`,
    ]);
  });
});

/** 調べられたら答え、**答え終えた時点で自分で終わる。** 止めに来たときにはもう居ない */
async function endsAfterProbe(pid: number): Promise<number> {
  const server = http.createServer((_req, res) => {
    res.on('finish', () => {
      server.closeAllConnections();
      server.close();
    });
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ app: 'glasshive', dev: false, pid, uptime_s: 5 }));
  });
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  return (server.address() as AddressInfo).port;
}

/* 調べてから止めに行くまでのあいだに、相手が自分で終わっていることは在る。**止まっている
   ものを止めようとしたことを誤りにすると、後片付けのスクリプトが毎回そこで転ぶ。** */
describe('調べた後に、自分で終わっていたとき', () => {
  /* していないことを言わない。**望みは叶っているが、叶えたのはこちらではない。** */
  it('止めそこねたことにせず、もう居なかったと書く', async () => {
    const port = await endsAfterProbe(22);
    const out = terminal();

    expect(await stopRunning(only(port), false, out), '望みは叶っている').toBe(0);
    expect(out.lines).toEqual([`glasshive: already gone: http://127.0.0.1:${port}`]);
  });

  it('止めたとは書かない', async () => {
    const port = await glasshive(33, 5);
    const gone = { origin: `http://127.0.0.1:${port}`, pid: 33, uptimeSecs: 5 };
    for (const server of servers.splice(0)) server.close();

    await expect(stopAt(gone)).resolves.toBe('already gone');
  });
});

/** 止める求めには答えるが終わらず、以後の接続を壊す。**ポートは握ったままである** */
async function answersThenResets(pid: number): Promise<number> {
  let quit = false;
  const server = net.createServer((socket) => {
    if (quit) {
      // 終わったふりだけして、握りは解かない
      socket.destroy();
      return;
    }
    socket.once('data', (chunk) => {
      const quitting = String(chunk).startsWith('POST /api/quit');
      const body = JSON.stringify(
        quitting ? { pid } : { app: 'glasshive', dev: false, pid, uptime_s: 5 },
      );
      if (quitting) quit = true;
      socket.end(
        `HTTP/1.1 200 OK\r\ncontent-type: application/json\r\ncontent-length: ${body.length}\r\nconnection: close\r\n\r\n${body}`,
      );
    });
  });
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  return (server.address() as AddressInfo).port;
}

/* 止める求めに答えたからといって、終わったとは限らない。**握りが解けたかはポートに訊く** ——
   相手が接続を壊しても、繋げたのならそのポートはまだ握られている。HTTP で訊くと、壊された
   ことが「繋げなかった」に見え、握られたままのポートを「止めた」と言うことになる。 */
describe('答えたのに終わらなかったとき', () => {
  /* 繋げたのでも、断られたのでもないとき。**握りについて何も分かっていないので、止まった
     ことにも止まらなかったことにもしない。** 断りだけを「解けた」と読む。 */
  it('繋がりも断られもしない相手は、分からなかったと言う', { timeout: 20_000 }, async () => {
    // 255.255.255.255 はどの機械でも OS の側で断られる。網には出ない
    const nowhere = { origin: 'http://255.255.255.255:9', pid: 1, uptimeSecs: 1 };

    await expect(stopAt(nowhere)).rejects.toThrow(
      'could not tell whether http://255.255.255.255:9 stopped',
    );
  });

  it('接続を壊されても、握られていることを見落とさない', { timeout: 20_000 }, async () => {
    const port = await answersThenResets(66);
    const out = terminal();

    await expect(stopRunning(only(port), false, out)).rejects.toThrow(
      `http://127.0.0.1:${port} did not stop`,
    );
    expect(out.lines, '止めたとは言わない').toEqual([
      `glasshive: could not stop http://127.0.0.1:${port}`,
    ]);
  });
});
