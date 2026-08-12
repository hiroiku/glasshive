/* すでに走っている glasshive を見つけて、開きたいディレクトリを伝える。

   **サーバーは 1 つに保つ。** 2 枚目を立ち上げると、`~/.claude/projects` の走査も索引も
   `git` の答えも、同じ機械の上でもう一度組み直すことになる。走っているものが在るなら、
   そこへ「このディレクトリを開きたい」と伝えて、返ってきた URL をブラウザーで開けばよい。

   開発中のものと、ビルドしたものは別に数える。開発中の glasshive がビルドされたものを
   使い回すと、書いたばかりのコードが画面に出ない。

   ここはランチャーと開発用のスクリプトの両方から使う。**判断を 2 つ持たないため**に
   1 か所へ置いてある —— 立ち上げ方によって「1 つに保つ」の意味が変わってはいけない。 */

import { DEFAULTS } from './cli.js';
import { COMMAND_HEADER, COMMAND_HEADER_VALUE } from './cli-request.js';

/** 待ち受ける先。外から届く場所では待たない */
export const LISTEN_ADDRESS = '127.0.0.1';

/* 返事を待つ時間。誰も待ち受けていなければ繋がらずに終わるので、この時間を使い切るのは
   「待ち受けてはいるが答えない相手」だけである。

   **短くしすぎない。** 立ち上げたばかりのプロセスは最初の `fetch` に思いのほか時間を掛ける
   ことがあり、そこで見切ると走っている glasshive を見落として 2 枚目が立ち上がる。 */
const PROBE_TIMEOUT_MS = 3000;

/* 既定のポートが埋まっていたときに、いくつ先まで見るか。**探すのは既定のときだけ**
   —— `--port` で名指されたら、その番号だけを見る。

   探す先と待ち受ける先は同じ範囲でなければならない。片方だけを広げると、走っている
   glasshive を見落として 2 枚目が立ち上がる。 */
const PORT_ATTEMPTS = 20;

/** glasshive が居るかもしれないポートの範囲。使い回す側と待ち受ける側で同じ範囲を使う */
export function portsToTry(port: number | undefined): { first: number; attempts: number } {
  return {
    first: port ?? DEFAULTS.port,
    attempts: port === undefined ? PORT_ATTEMPTS : 1,
  };
}

/** そこに居るのが glasshive か。開発中かどうかまで一致したときだけ「居る」と答える */
export async function isGlasshive(origin: string, dev: boolean): Promise<boolean> {
  try {
    const response = await fetch(`${origin}/api/health`, {
      signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
    });
    if (!response.ok) return false;
    const body = (await response.json()) as { app?: unknown; dev?: unknown };
    return body.app === 'glasshive' && body.dev === dev;
  } catch {
    /* 繋がらないのも、別のプログラムが答えたのも、ここでは同じである ——
       どちらも「使い回せる glasshive は居ない」に落ちる */
    return false;
  }
}

/* 使い回せる glasshive を探す。見つからなければ `null`。

   範囲の全部に一度に尋ねる。順に尋ねると、答えない相手が 1 つ在るだけでそのぶん待たされ、
   **立ち上がるのが遅い glasshive** という形で使う人に出る。答えは番号の小さいほうから採る ——
   探す順と待ち受ける順を揃えておかないと、2 回目と 3 回目で違うウィンドウが開く。 */
export async function findRunning(
  range: { readonly first: number; readonly attempts: number },
  dev: boolean,
): Promise<string | null> {
  const ports = Array.from({ length: range.attempts }, (_, i) => range.first + i);
  const origins = ports.map((port) => `http://${LISTEN_ADDRESS}:${port}`);
  const answers = await Promise.all(origins.map((origin) => isGlasshive(origin, dev)));
  return origins.find((_, i) => answers[i]) ?? null;
}

/* 開きたいディレクトリを伝えて、開く先の URL を受け取る。

   **どのプロジェクトがどの URL に居るかを、こちらは組み立てない。** 名指されたパスが
   どのプロジェクトを指すかを決めるのは索引と `git` で、伝えに来たコマンドはその答えを
   知らない。ディレクトリを名指していなければ、開くのはそのまま Overview である。 */
export async function openDirectoryAt(origin: string, path: string | undefined): Promise<string> {
  if (path === undefined) return origin;

  const response = await fetch(`${origin}/api/open`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      /* コマンドから来たことを、こちらから伝える。付けずに送れば断られる —— 断られるのが
         正しく、それはブラウザーが同じ求めを出せないということである。 */
      [COMMAND_HEADER]: COMMAND_HEADER_VALUE,
    },
    body: JSON.stringify({ path }),
  });
  const body = (await response.json().catch(() => null)) as {
    url?: unknown;
    message?: unknown;
  } | null;
  if (!response.ok || typeof body?.url !== 'string') {
    throw new Error(
      typeof body?.message === 'string' ? body.message : `could not open ${path} at ${origin}`,
    );
  }
  return `${origin}${body.url}`;
}
