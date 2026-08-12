import { spawn } from 'node:child_process';
import http from 'node:http';
import { fileURLToPath } from 'node:url';
import { type Args, DEFAULTS } from './cli.js';
import { isLocalHost } from './host-guard.js';
import { toRequest, writeResponse } from './http-adapter.js';
import { serveShell, serveStatic } from './static.js';

const LISTEN_ADDRESS = '127.0.0.1';

/* 既定のポートが埋まっていたときに、いくつ先まで空きを探すか。**探すのは既定のときだけ**
   —— `--port` で名指されたら、その番号で待てなかったことを黙らずに終わる。

   ディレクトリを名指して開く使い方では、同時に何枚も開いているのが普通の状態になる。 */
const PORT_ATTEMPTS = 20;

/* 名指したディレクトリを開くための入口。ランチャーは id を組み立てない —— どの
   プロジェクトを指すかを決めるのは索引と `git` で、ここはその答えを知らない。 */
const HERE_PATH = '/here';

function listen(server: http.Server, port: number): Promise<number> {
  return new Promise<number>((resolve, reject) => {
    const fail = (error: unknown) => reject(error);
    server.once('error', fail);
    server.listen(port, LISTEN_ADDRESS, () => {
      server.removeListener('error', fail);
      resolve(port);
    });
  });
}

const inUse = (error: unknown): boolean =>
  (error as NodeJS.ErrnoException | null)?.code === 'EADDRINUSE';

/* サーバーバンドルが答えるパスの接頭辞。ここに来たリクエストだけを渡し、それ以外は静的ファイルか
   HTML シェルで返す。フレームワーク側の既定の振る舞いに任せず、こちらで決める —
   任せると、バージョンが変わった日にどのパスが誰の担当かが黙って入れ替わる。 */
const HANDLED_PREFIXES = ['/api/', '/_serverFn'] as const;

interface ServerEntry {
  fetch(request: Request): Promise<Response> | Response;
}

function openBrowser(url: string): void {
  const cmd =
    process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'start' : 'xdg-open';
  try {
    spawn(cmd, [url], { stdio: 'ignore', detached: true }).unref();
  } catch {
    /* ブラウザーを開けなくても致命ではない。URL は下に出してある */
  }
}

export async function launch(args: Args): Promise<http.Server> {
  const clientDir = fileURLToPath(new URL('../client', import.meta.url));
  const entryUrl = new URL('../server/server.js', import.meta.url).href;

  /* 設定は環境変数で渡す。ランチャーは `tsc` で別にビルドされてサーバーバンドルとは
     別の実体になるので、変数を直接渡す手段が無い。 */
  process.env.GLASSHIVE_ACTIVE_THRESHOLD_MS = String(Math.round(args.activeThresholdSecs * 1000));
  if (args.configDir !== undefined) process.env.GLASSHIVE_CONFIG_DIR = args.configDir;
  if (args.target !== undefined) process.env.GLASSHIVE_TARGET = args.target;

  const entry = ((await import(entryUrl)) as { default: ServerEntry }).default;

  const server = http.createServer((req, res) => {
    void (async () => {
      const host = req.headers.host;
      if (!isLocalHost(host)) {
        res.writeHead(403, { 'content-type': 'text/plain; charset=utf-8' });
        res.end('forbidden host\n');
        return;
      }

      let pathname: string;
      try {
        pathname = new URL(req.url ?? '/', `http://${host}`).pathname;
      } catch {
        res.writeHead(400, { 'content-type': 'text/plain; charset=utf-8' });
        res.end('bad request\n');
        return;
      }

      if (HANDLED_PREFIXES.some((p) => pathname.startsWith(p))) {
        try {
          await writeResponse(res, await entry.fetch(toRequest(req, res, `http://${host}`)));
        } catch (e) {
          if (!res.headersSent) {
            res.writeHead(500, { 'content-type': 'text/plain; charset=utf-8' });
            res.end(`${e instanceof Error ? e.message : String(e)}\n`);
          } else {
            res.end();
          }
        }
        return;
      }

      if (serveStatic(res, clientDir, pathname)) return;
      serveShell(res, clientDir);
    })();
  });

  /* 名指されたポートでは 1 度だけ試す。既定のポートは、埋まっていたら次の空きへ落ちる ——
     ディレクトリごとに開く使い方では、埋まっているのが普通の状態だからである。 */
  const first = args.port ?? DEFAULTS.port;
  const attempts = args.port === undefined ? PORT_ATTEMPTS : 1;
  let port: number | undefined;
  for (let i = 0; i < attempts; i++) {
    try {
      port = await listen(server, first + i);
      break;
    } catch (error) {
      if (!inUse(error) || i === attempts - 1) throw error;
    }
  }
  if (port === undefined) throw new Error(`no free port from ${first} to ${first + attempts - 1}`);

  const origin = `http://${LISTEN_ADDRESS}:${port}`;
  /* 開く先が Overview なのか 1 つのディレクトリなのかを、端末にも出す。**名指したパスをそのまま
     出す** —— リポジトリまで登った先を出すのは画面の側で、ここに出すのは打った相手が
     受け取られたことの控えである。 */
  const url = args.target === undefined ? origin : `${origin}${HERE_PATH}`;
  console.log(`glasshive: ${origin}`);
  if (args.target !== undefined) console.log(`           ${args.target}`);
  if (args.open) openBrowser(url);
  return server;
}
