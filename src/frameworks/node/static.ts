import fs from 'node:fs';
import type { ServerResponse } from 'node:http';
import path from 'node:path';

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.map': 'application/json',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
};

/* 組み立て時に名前へ中身の指紋が入る一群。中身が変われば名前も変わるので、
   いつまでも覚えていてよい。それ以外は毎回確かめさせる。 */
const FINGERPRINTED = '/assets/';

/** 実在する資産だけを配る。木の外は配らない。配ったら true。 */
export function serveStatic(res: ServerResponse, clientDir: string, pathname: string): boolean {
  if (pathname === '/' || pathname.endsWith('/')) return false;

  let decoded: string;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    return false; // 符号化が壊れている求めは資産の求めとして扱わない
  }
  if (decoded.includes('\0')) return false;

  /* 木の外へ出さない。normalize の後に根で始まるかを見る —
     ".." を数えて弾くやり方は、符号化の違いで抜けられる。 */
  const target = path.normalize(path.join(clientDir, decoded));
  if (!target.startsWith(clientDir + path.sep)) return false;

  let body: Buffer;
  try {
    const stat = fs.statSync(target);
    if (!stat.isFile()) return false;
    body = fs.readFileSync(target);
  } catch {
    return false; // 無いものは無い。画面の道かもしれないので、断らずに次へ渡す
  }

  res.writeHead(200, {
    'content-type': MIME[path.extname(target)] ?? 'application/octet-stream',
    'cache-control': decoded.startsWith(FINGERPRINTED)
      ? 'public, max-age=31536000, immutable'
      : 'no-cache',
  });
  res.end(body);
  return true;
}

/** 画面の器を返す。どの道へ来ても、描くのはブラウザーである。 */
export function serveShell(res: ServerResponse, clientDir: string): void {
  try {
    const body = fs.readFileSync(path.join(clientDir, '_shell.html'));
    res.writeHead(200, {
      'content-type': MIME['.html'] as string,
      'cache-control': 'no-cache',
    });
    res.end(body);
  } catch {
    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
    res.end('画面が組み上がっていません(npm run build を実行してください)\n');
  }
}
