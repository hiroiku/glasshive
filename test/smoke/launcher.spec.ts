import { type ChildProcess, spawn } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/* 組み上がった配りものを、外から叩く。

   ここだけが「本当に配るもの」を見る。中の層をどれだけ検めても、起動口と束ね役の
   繋ぎ目は組み上げてからでないと確かめられない。

   **覚え書きの置き場は必ず仮の棚へ向ける。** 走らせた人の本物の設定を書き換えない。 */

const ROOT = path.resolve(import.meta.dirname, '..', '..');

/** 空いている番を OS に選ばせる。決め打ちだと、他が使っている機械で落ちる */
async function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.once('error', reject);
    probe.listen(0, '127.0.0.1', () => {
      const address = probe.address();
      if (address === null || typeof address === 'string') {
        probe.close(() => reject(new Error('番を選べなかった')));
        return;
      }
      const { port } = address;
      probe.close(() => resolve(port));
    });
  });
}

async function waitUntilUp(url: string, child: ChildProcess): Promise<void> {
  const deadline = Date.now() + 30_000;
  for (;;) {
    if (child.exitCode !== null) throw new Error(`起動口が落ちた: ${child.exitCode}`);
    try {
      await fetch(url, { signal: AbortSignal.timeout(1000) });
      return;
    } catch {
      if (Date.now() > deadline) throw new Error('起動を待ちきれなかった');
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
  }
}

describe('配りものを外から叩く', () => {
  let child: ChildProcess;
  let origin: string;
  let configDir: string;
  let transcriptsRoot: string;

  beforeAll(async () => {
    if (!fs.existsSync(path.join(ROOT, 'dist', 'launcher', 'index.js'))) {
      throw new Error('先に npm run build を済ませること');
    }
    const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'glasshive-smoke-'));
    configDir = path.join(sandbox, 'config');
    /* 観測元も仮の棚へ向ける。本物の `~/.claude` を読むと、走らせる機械ごとに
       答えが変わってしまい、落ちた理由が配りものの側か中身の側か分からなくなる。 */
    transcriptsRoot = path.join(sandbox, 'projects');
    fs.mkdirSync(transcriptsRoot, { recursive: true });

    const port = await freePort();
    origin = `http://127.0.0.1:${port}`;
    child = spawn(process.execPath, ['bin/glasshive.js', '--no-open', '--port', String(port)], {
      cwd: ROOT,
      env: {
        ...process.env,
        GLASSHIVE_CONFIG_DIR: configDir,
        GLASSHIVE_PROJECTS_ROOT: transcriptsRoot,
      },
      stdio: 'ignore',
    });
    await waitUntilUp(origin, child);
  }, 60_000);

  afterAll(() => {
    child?.kill();
  });

  it('画面の器を返す', async () => {
    const response = await fetch(origin);
    expect(response.status).toBe(200);
    expect(await response.text()).toContain('<html');
  });

  /* `fetch` は Host を送らせてくれないので、生の求めで叩く。
     見張りたいのはまさにその頭なので、送れない道具では確かめられない。 */
  it('名前を差し替えた求めは断る', async () => {
    const url = new URL(origin);
    const status = await new Promise<number>((resolve, reject) => {
      const request = http.request(
        {
          host: url.hostname,
          port: url.port,
          path: '/',
          headers: { Host: 'evil.example' },
        },
        (res) => {
          res.resume();
          resolve(res.statusCode ?? 0);
        },
      );
      request.once('error', reject);
      request.end();
    });
    expect(status, '手元だけで待ち受けても、名前を手元に化けさせた求めは届いてしまう').toBe(403);
  });

  it('届き続ける答えは、最初の一言をすぐ流す', async () => {
    const controller = new AbortController();
    const response = await fetch(`${origin}/api/stream`, {
      signal: controller.signal,
    });
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('text/event-stream');

    const reader = response.body?.getReader();
    expect(reader, '本文が無ければ届き続ける答えにならない').toBeDefined();
    const first = await reader?.read();
    expect(
      new TextDecoder().decode(first?.value),
      '溜めてから流すと、繋がったことが観る人に分からない',
    ).toContain(': connected');
    controller.abort();
  });

  /* 器に待ちの姿が焼かれていること。

     焼かれていないと、器は空のままブラウザーへ渡り、引き継ぐ側は道の中身を描くので
     食い違う。React は黙って木を丸ごと作り直すだけなので、**画面を見ても気付けない**。 */
  it('器には、待ちの姿が焼かれている', async () => {
    const shell = fs.readFileSync(path.join(ROOT, 'dist', 'client', '_shell.html'), 'utf8');
    expect(shell, '空の器を引き継がせると、木が丸ごと作り直される').toContain('観ています…');
  });

  /* 器は 1 枚しかなく、どの道を直に開いてもこれが渡る。焼くときに描き手が居るのは
     一覧(`/`)なので、「いま居る道」の印を焼き込むと、巣の画面を直に開いた人の
     最初の描画と食い違い、やはり木が丸ごと作り直される。 */
  it('器は、どの道に居るかを知らない', async () => {
    const shell = fs.readFileSync(path.join(ROOT, 'dist', 'client', '_shell.html'), 'utf8');
    expect(shell, '器に道の印が焼かれると、別の道を直に開いた人だけが作り直しを踏む').not.toContain(
      'aria-current',
    );
    expect(shell).not.toContain('data-status="active"');
  });

  /* 字そのものを配りものが持っていること。名前で指すだけにすると、入っている機械では
     気付かないまま通り、入っていない機械でだけ字面が変わる。 */
  it('字は配りものの中に在る', async () => {
    const assets = path.join(ROOT, 'dist', 'client', 'assets');
    const names = fs.readdirSync(assets);
    const styles = names.filter((name) => name.endsWith('.css'));
    const css = styles.map((name) => fs.readFileSync(path.join(assets, name), 'utf8')).join('');

    expect(css, '地の文の書体が配りものの中で名指されていない').toContain('Noto Sans JP Variable');
    expect(css, '等幅の書体が配りものの中で名指されていない').toContain('Noto Sans Mono Variable');
    expect(
      names.filter((name) => name.endsWith('.woff2')).length,
      '名前だけ指して字を連れてこないと、入っていない機械で別の書体になる',
    ).toBeGreaterThan(0);
  });

  it('観測元へは何も書かない', async () => {
    await fetch(origin);
    expect(
      fs.readdirSync(transcriptsRoot),
      'ひと目観るだけで観測元に何かが増えるなら、それはもう観る道具ではない',
    ).toEqual([]);
  });
});
