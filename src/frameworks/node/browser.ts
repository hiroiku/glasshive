import { spawn } from 'node:child_process';

/* ブラウザーを開く。起動しても、走っているものへ伝えても、開き方は同じ 1 つである。

   開けなくても致命ではない —— URL は端末に出してあるので、そこから開ける。 */
export function openBrowser(url: string): void {
  const cmd =
    process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'start' : 'xdg-open';
  try {
    spawn(cmd, [url], { stdio: 'ignore', detached: true }).unref();
  } catch {
    /* 開けなかったことは、観測の結果ではない */
  }
}
