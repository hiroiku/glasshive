import { type ChildProcess, spawn } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/* 組み上がったパッケージを、外から叩く。

   ここだけが「実際に配られるもの」を見る。中の層をどれだけ検証しても、ランチャーと
   サーバーバンドルの繋ぎ目は、ビルドしてからでないと確かめられない。

   **`preferences.json` の保存先は必ず一時ディレクトリへ向ける。** 走らせた人の本物の設定を
   書き換えない。 */

const ROOT = path.resolve(import.meta.dirname, '..', '..');

/** 空いているポートを OS に選ばせる。決め打ちだと、他が使っている機械で落ちる */
async function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.once('error', reject);
    probe.listen(0, '127.0.0.1', () => {
      const address = probe.address();
      if (address === null || typeof address === 'string') {
        probe.close(() => reject(new Error('ポートを選べなかった')));
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
    if (child.exitCode !== null) throw new Error(`ランチャーが落ちた: ${child.exitCode}`);
    try {
      await fetch(url, { signal: AbortSignal.timeout(1000) });
      return;
    } catch {
      if (Date.now() > deadline) throw new Error('起動を待ちきれなかった');
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
  }
}

describe('パッケージを外から叩く', () => {
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
    /* 観測元も一時ディレクトリへ向ける。本物の `~/.claude` を読むと、走らせる機械ごとに
       結果が変わってしまい、落ちた理由がパッケージの側か中身の側か分からなくなる。 */
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

  it('HTML シェルを返す', async () => {
    const response = await fetch(origin);
    expect(response.status).toBe(200);
    expect(await response.text()).toContain('<html');
  });

  /* `fetch` は `Host` を送らせてくれないので、`node:http` の生のリクエストで叩く。
     確かめたいのはまさにその `Host` ヘッダーなので、差し替えられない API では検証できない。 */
  it('Host を差し替えたリクエストは断る', async () => {
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
    expect(
      status,
      'ローカルだけで待ち受けても、Host をローカルに化けさせたリクエストは届いてしまう',
    ).toBe(403);
  });

  it('SSE のレスポンスは、最初の 1 行をすぐ流す', async () => {
    const controller = new AbortController();
    const response = await fetch(`${origin}/api/stream`, {
      signal: controller.signal,
    });
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('text/event-stream');

    const reader = response.body?.getReader();
    expect(reader, '本文が無ければストリームにならない').toBeDefined();
    const first = await reader?.read();
    expect(
      new TextDecoder().decode(first?.value),
      '溜めてから流すと、繋がったことがクライアントに分からない',
    ).toContain(': connected');
    controller.abort();
  });

  /* HTML シェルにローディング表示が焼かれていること。

     焼かれていないと、シェルは空のままブラウザーへ渡り、hydration する側はルートの中身を
     描くので食い違う。React は黙って木を丸ごと作り直すだけなので、**画面を見ても気付けない**。 */
  it('HTML シェルには、ローディング表示が焼かれている', async () => {
    const shell = fs.readFileSync(path.join(ROOT, 'dist', 'client', '_shell.html'), 'utf8');
    expect(shell, '空の HTML シェルを hydration させると、木が丸ごと作り直される').toContain(
      'Loading…',
    );
  });

  /* HTML シェルは 1 枚しかなく、どのルートを直に開いてもこれが渡る。ビルド時に描くのは
     Overview(`/`)なので、「いま居るルート」を示す `aria-current` を焼き込むと、プロジェクトの
     画面を直に開いたユーザーの最初の描画と食い違い、やはり木が丸ごと作り直される。 */
  it('HTML シェルは、どのルートに居るかを知らない', async () => {
    const shell = fs.readFileSync(path.join(ROOT, 'dist', 'client', '_shell.html'), 'utf8');
    expect(
      shell,
      'HTML シェルに aria-current が焼かれると、別のルートを直に開いたユーザーだけが作り直しを踏む',
    ).not.toContain('aria-current');
    expect(shell).not.toContain('data-status="active"');
  });

  /* フォントの実体をパッケージが持っていること。名前で指すだけにすると、入っている機械では
     気付かないまま通り、入っていない機械でだけ見た目が変わる。 */
  it('フォントはパッケージの中に在る', async () => {
    const assets = path.join(ROOT, 'dist', 'client', 'assets');
    const names = fs.readdirSync(assets);
    const styles = names.filter((name) => name.endsWith('.css'));
    const css = styles.map((name) => fs.readFileSync(path.join(assets, name), 'utf8')).join('');

    expect(css, '地の文の書体がビルド成果物の中で名指されていない').toContain(
      'Noto Sans JP Variable',
    );
    expect(css, '等幅の書体がビルド成果物の中で名指されていない').toContain(
      'Noto Sans Mono Variable',
    );
    expect(
      names.filter((name) => name.endsWith('.woff2')).length,
      '名前だけ指してフォントファイルを連れてこないと、入っていない機械で別の書体になる',
    ).toBeGreaterThan(0);
  });

  it('観測元へは何も書かない', async () => {
    await fetch(origin);
    expect(
      fs.readdirSync(transcriptsRoot),
      'ひと目観るだけで観測元に何かが増えるなら、それはもう観測ツールではない',
    ).toEqual([]);
  });
});
