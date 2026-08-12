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

/** 走っている glasshive 1 つ。**どのターミナルが持っているかを覚えていなくても分かるもの** */
export interface RunningInstance {
  readonly origin: string;
  readonly pid: number;
  readonly uptimeSecs: number;
}

/* そこに居るのが glasshive か。開発中かどうかまで一致したときだけ答える。

   居ないときは `null`。**繋がらないのと、別のプログラムが答えたのは、ここでは同じである**
   —— どちらも「使い回せる glasshive は居ない」に落ちる。 */
export async function askGlasshive(origin: string, dev: boolean): Promise<RunningInstance | null> {
  try {
    const response = await fetch(`${origin}/api/health`, {
      signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
    });
    if (!response.ok) return null;
    const body = (await response.json()) as {
      app?: unknown;
      dev?: unknown;
      pid?: unknown;
      uptime_s?: unknown;
    };
    if (body.app !== 'glasshive' || body.dev !== dev) return null;
    return {
      origin,
      /* 答えなかった欄は 0 にする。**居るかどうかの答えを、添え物のせいで変えない** ——
         古い glasshive が相手でも、使い回せることに変わりはない。 */
      pid: typeof body.pid === 'number' ? body.pid : 0,
      uptimeSecs: typeof body.uptime_s === 'number' ? body.uptime_s : 0,
    };
  } catch {
    return null;
  }
}

/** そこに居るのが glasshive か。居場所だけを見たいところはこちらを使う */
export const isGlasshive = async (origin: string, dev: boolean): Promise<boolean> =>
  (await askGlasshive(origin, dev)) !== null;

/* 範囲に居る glasshive を全部見つける。番号の小さいほうから並ぶ。

   範囲の全部に一度に尋ねる。順に尋ねると、答えない相手が 1 つ在るだけでそのぶん待たされ、
   **立ち上がるのが遅い glasshive** という形で使う人に出る。

   **1 つに保つと決めていても、2 つ以上見つかることは在る。** そう決める前に立ち上げたもの、
   `--port` で別の番号を名指して立てたもの、閉じ忘れたもの。居場所を訊きに来た人に 1 つだけ
   答えると、残りは見えないまま動き続ける。 */
export async function findAllRunning(
  range: { readonly first: number; readonly attempts: number },
  dev: boolean,
): Promise<readonly RunningInstance[]> {
  const ports = Array.from({ length: range.attempts }, (_, i) => range.first + i);
  const answers = await Promise.all(
    ports.map((port) => askGlasshive(`http://${LISTEN_ADDRESS}:${port}`, dev)),
  );
  return answers.filter((answer) => answer !== null);
}

/* 使い回せる glasshive を 1 つ。見つからなければ `null`。

   **番号の小さいほうから採る** —— 探す順と待ち受ける順を揃えておかないと、2 回目と 3 回目で
   違うウィンドウが開く。 */
export const findRunning = async (
  range: { readonly first: number; readonly attempts: number },
  dev: boolean,
): Promise<RunningInstance | null> => (await findAllRunning(range, dev))[0] ?? null;

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

/* 走っている glasshive を終わらせる。

   **終わったことを見届けてから戻る。** 答えが返っただけでは、まだポートを握っている ——
   止めた直後に立ち上げ直す人が、自分が止めたサーバーに弾かれる。 */
export async function stopAt(instance: RunningInstance): Promise<void> {
  const response = await fetch(`${instance.origin}/api/quit`, {
    method: 'POST',
    headers: { [COMMAND_HEADER]: COMMAND_HEADER_VALUE },
  });
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { message?: unknown } | null;
    throw new Error(
      typeof body?.message === 'string' ? body.message : `could not stop ${instance.origin}`,
    );
  }
  await response.arrayBuffer();
  await waitUntilGone(instance.origin);
}

/** 見届けるのを諦めるまで。止まらないサーバーを待ち続けるより、待ったことを言って終わる */
const GONE_TIMEOUT_MS = 5000;

/** 見届けるあいだ、どれだけ置いて尋ね直すか */
const GONE_INTERVAL_MS = 50;

async function waitUntilGone(origin: string): Promise<void> {
  const until = Date.now() + GONE_TIMEOUT_MS;
  while (Date.now() < until) {
    await new Promise((resolve) => setTimeout(resolve, GONE_INTERVAL_MS));
    if (!(await isReachable(origin))) return;
  }
  throw new Error(`${origin} did not stop`);
}

/** そこがまだ何かを答えるか。glasshive かどうかは見ない —— 見たいのは握りが解けたことである */
async function isReachable(origin: string): Promise<boolean> {
  try {
    await fetch(`${origin}/api/health`, { signal: AbortSignal.timeout(PROBE_TIMEOUT_MS) });
    return true;
  } catch {
    return false;
  }
}
