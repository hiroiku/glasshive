import { spawn } from 'node:child_process';
import http from 'node:http';
import { fileURLToPath } from 'node:url';
import type { Args } from './cli.js';
import { isLocalHost } from './host-guard.js';
import { toRequest, writeResponse } from './http-adapter.js';
import { serveShell, serveStatic } from './static.js';

const LISTEN_ADDRESS = '127.0.0.1';

/* 束ね役が答える道。ここに来た求めだけを渡し、それ以外は資産か画面の器で返す。
   配りものの側の振る舞いに任せず、こちらで決める — 任せると、版が変わった日に
   どの道が誰の担当かが黙って入れ替わる。 */
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
    /* 開けなくても致命ではない。番地は下に出してある */
  }
}

export async function launch(args: Args): Promise<http.Server> {
  const clientDir = fileURLToPath(new URL('../client', import.meta.url));
  const entryUrl = new URL('../server/server.js', import.meta.url).href;

  /* 設定は環境変数で渡す。起動口は tsc で別に組むので、束ね役とは別の実体になり、
     変数を直接渡す道が無い。 */
  process.env.GLASSHIVE_ACTIVE_THRESHOLD_MS = String(Math.round(args.activeThresholdSecs * 1000));
  if (args.configDir !== undefined) process.env.GLASSHIVE_CONFIG_DIR = args.configDir;

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

  return await new Promise<http.Server>((resolve, reject) => {
    server.once('error', reject);
    server.listen(args.port, LISTEN_ADDRESS, () => {
      server.removeListener('error', reject);
      const url = `http://${LISTEN_ADDRESS}:${args.port}`;
      console.log(`glasshive: ${url}`);
      if (args.open) openBrowser(url);
      resolve(server);
    });
  });
}
