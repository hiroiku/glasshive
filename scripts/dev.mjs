#!/usr/bin/env node

// 開発中の入口。`glasshive [path]` と同じ引数を受け取り、同じ 1 つのサーバーに集める。
//
// 引数の読み方も「そこに居るのは誰か」の見分け方も、ランチャーと同じコードを呼ぶ。
// ここで書き直すと、開発中と配ったパッケージとで `glasshive .` の意味が静かに食い違う。
// TypeScript のまま読めるのは Vite の `runnerImport` による — 開発サーバーを立てる前に
// 済むので、走っているものが在ったときに何も立てずに終われる。

import { fileURLToPath } from 'node:url';
import { createServer, runnerImport } from 'vite';

const from = (file) => fileURLToPath(new URL(`../src/frameworks/node/${file}`, import.meta.url));

const [cli, instance, browser] = await Promise.all(
  ['cli.ts', 'instance.ts', 'browser.ts'].map(async (file) => {
    const loaded = await runnerImport(from(file), { configFile: false });
    return loaded.module;
  }),
);

const parsed = cli.parseArgs(process.argv.slice(2));
if (!parsed.ok) {
  (parsed.exitCode === 0 ? process.stdout : process.stderr).write(parsed.message);
  process.exit(parsed.exitCode);
}
const args = parsed.args;

// 走っている開発中の glasshive が在れば、そこへ伝えて終わる。ビルドしたものは使い回さない —
// 書いたばかりのコードが画面に出ないまま「開いた」ことになる。
const running = await instance.findRunning(instance.portsToTry(args.port), true);
if (running !== null) {
  const url = await instance.openDirectoryAt(running, args.target);
  console.log(`glasshive: ${running} (already running)`);
  if (args.target !== undefined) console.log(`           ${args.target}`);
  if (args.open) browser.openBrowser(url);
  process.exit(0);
}

// 設定は環境変数で渡す。開発サーバーの中で走るアプリとは別のプロセス空間ではないので、
// ここで置けば `currentSettings()` が読む。
process.env.GLASSHIVE_ACTIVE_THRESHOLD_MS = String(Math.round(args.activeThresholdSecs * 1000));
if (args.configDir !== undefined) process.env.GLASSHIVE_CONFIG_DIR = args.configDir;
if (args.target !== undefined) process.env.GLASSHIVE_TARGET = args.target;

// 名指されたポートでは、そこで待てなかったことを黙らずに終わる。既定のポートは、
// 別のプログラム(ビルドした glasshive を含む)が握っていたら次の空きへ落ちる。
const server = await createServer({
  server: args.port === undefined ? {} : { port: args.port, strictPort: true },
});
try {
  await server.listen();
} catch (error) {
  // 待てなかった理由をそのまま出す。スタックまで出すと、直せる情報がその中に埋もれる
  console.error(`glasshive: ${error instanceof Error ? error.message : String(error)}`);
  await server.close();
  process.exit(1);
}
server.printUrls();
server.bindCLIShortcuts({ print: true });

const origin = server.resolvedUrls?.local?.[0]?.replace(/\/$/, '');
if (args.target !== undefined) console.log(`  ➜  Opening ${args.target}`);
if (args.open && origin !== undefined) {
  browser.openBrowser(args.target === undefined ? origin : `${origin}/here`);
}
