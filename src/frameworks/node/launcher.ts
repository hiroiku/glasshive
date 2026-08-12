import http from 'node:http';
import { fileURLToPath } from 'node:url';
import { openBrowser } from './browser.js';
import type { Args } from './cli.js';
import { isLocalHost } from './host-guard.js';
import { toRequest, writeResponse } from './http-adapter.js';
import {
  askGlasshive,
  findRunning,
  LISTEN_ADDRESS,
  openDirectoryAt,
  portsToTry,
} from './instance.js';
import { serveShell, serveStatic } from './static.js';

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

/* 走っているものが在れば `null` を返す。**そのときサーバーは立てていない** —— 呼んだ側が
   終わってよいことを、型で言う。 */
export async function launch(args: Args): Promise<http.Server | null> {
  const range = portsToTry(args.port);

  /* 先に「そこに居るのは誰か」を尋ねる。**サーバーバンドルを読み込む前に済ませる** ——
     使い回せる glasshive が在るなら、読み込むだけ無駄になる。走査も索引も `git` の答えも、
     走っているその 1 つが持っているものをそのまま使える。 */
  const running = await findRunning(range, false);
  if (running !== null) return await joinRunning(running.origin, args);

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

  /* ポートを 1 つずつ見ていく。埋まっていたら、**もう一度そこに尋ねてから次へ行く** ——
     さっきの走査から今までの間に立ち上がった glasshive と、立ち上がってはいたが最初の
     求めに答えるのが間に合わなかった glasshive が、ここで拾える。拾わないと、握っているのが
     glasshive なのに 2 枚目を立てようとして、名指されたポートでは断って終わる。 */
  let port: number | undefined;
  for (let i = 0; i < range.attempts; i++) {
    const at = range.first + i;
    try {
      port = await listen(server, at);
      break;
    } catch (error) {
      if (!inUse(error)) throw error;
      const late = await askGlasshive(`http://${LISTEN_ADDRESS}:${at}`, false);
      if (late !== null) return await joinRunning(late.origin, args);
      if (i === range.attempts - 1) throw error;
    }
  }
  if (port === undefined) {
    throw new Error(`no free port from ${range.first} to ${range.first + range.attempts - 1}`);
  }

  const origin = `http://${LISTEN_ADDRESS}:${port}`;
  /* 開く先が Overview なのか 1 つのディレクトリなのかを、端末にも出す。**名指したパスをそのまま
     出す** —— リポジトリまで登った先を出すのは画面の側で、ここに出すのは打った相手が
     受け取られたことの控えである。

     自分で立ち上げたときは `/here` を開く。ここで先に解決してから開くこともできるが、
     解決には索引が要る —— 走り出したばかりのサーバーでそれを待つと、ブラウザーが開くのが
     そのぶん遅れる。`/here` なら画面はすぐ開き、待ちはバーが引き受ける。 */
  const url = args.target === undefined ? origin : `${origin}${HERE_PATH}`;
  console.log(`glasshive: ${origin}`);
  if (args.target !== undefined) console.log(`           ${args.target}`);
  if (args.open) openBrowser(url);
  return server;
}

/* 走っている glasshive へ、開きたいディレクトリを伝える。**自分ではサーバーを立てない。**

   伝えた先が答える URL を開く。ここでは待ちの画面を挟まない —— 走っているサーバーは
   索引を持っているので、答えはすぐに返る。 */
async function joinRunning(origin: string, args: Args): Promise<null> {
  const url = await openDirectoryAt(origin, args.target);
  console.log(`glasshive: ${origin} (already running)`);
  if (args.target !== undefined) console.log(`           ${args.target}`);
  if (args.open) openBrowser(url);
  return null;
}
