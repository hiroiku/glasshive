/* すでに走っている glasshive を見つけて、開きたいディレクトリを伝える。

   **サーバーは 1 つに保つ。** 2 枚目を立ち上げると、`~/.claude/projects` の走査も索引も
   `git` の答えも、同じ機械の上でもう一度組み直すことになる。走っているものが在るなら、
   そこへ「このディレクトリを開きたい」と伝えて、返ってきた URL をブラウザーで開けばよい。

   開発中のものと、ビルドしたものは別に数える。開発中の glasshive がビルドされたものを
   使い回すと、書いたばかりのコードが画面に出ない。

   ここはランチャーと開発用のスクリプトの両方から使う。**判断を 2 つ持たないため**に
   1 か所へ置いてある —— 立ち上げ方によって「1 つに保つ」の意味が変わってはいけない。 */

import net from 'node:net';
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
  /* 答えなかった欄は `null`。**0 と、言わなかったのは別である** —— `pid` を出さない古い
     glasshive を「pid 0」と書くと、`ps` から辿ろうとした人はそこで行き止まりになる。 */
  readonly pid: number | null;
  readonly uptimeSecs: number | null;
}

/* そのポートを尋ねた答え。

   **無かったのと、観測できなかったのは別である。** 答えが返らなかったことは、そこに
   glasshive が居ないことではない —— 立ち上がったばかりで最初の `fetch` に手間取っている
   ものも、大きな `~/.claude/projects` を走査している最中のものも、まだポートを握ったまま
   答えないだけである。ここで畳むと、握られたままのポートを空いていると言うことになる。 */
export type Probe =
  | { readonly kind: 'observed'; readonly instance: RunningInstance }
  | { readonly kind: 'absent' }
  | { readonly kind: 'unobservable' };

/* そこに居るのが glasshive か。開発中かどうかまで一致したときだけ `observed` と答える。

   答えが返ったなら、それが何であれ観測はできている。2xx でなかったのも、JSON として
   読めなかったのも、別の `app` を自己申告したのも「無かった」である —— `/api/health` は
   I/O を持たない 1 つの `Response.json` なので、そこから 2xx 以外が返ることは実際上なく、
   返ってきたならそのポートは別のプログラムが握っている。

   繋げなかったのも、繋いだ先が接続を壊したのも、HTTP でないものを返したのも同じく
   「無かった」である。**ポートが空いていることと、glasshive が居ないことは別の問いで、
   ここが答えるのは後ろのほうである。** そのポートを何が握っていようと、glasshive として
   答えなかったことは観測できている。

   **時間切れだけが「観測できなかった」である。** 相手はまだ握ったまま、答えられないだけ
   かもしれない —— 走査の最中の glasshive も、立ち上がったばかりのものも、そう見える。 */
export async function probeGlasshive(origin: string, dev: boolean): Promise<Probe> {
  const signal = AbortSignal.timeout(PROBE_TIMEOUT_MS);
  try {
    const response = await fetch(`${origin}/api/health`, {
      signal,
      /* 転送先を追わない。**追うと、答えた相手と尋ねた先が別になる** —— そのポートを
         握った別のプログラムが `Location` を返すだけで、glasshive の自己申告も `pid` も
         好きな所から持って来られる。3xx は `ok` ではないので、ここで落ちる。 */
      redirect: 'manual',
    });
    if (!response.ok) return { kind: 'absent' };
    const body = (await response.json()) as {
      app?: unknown;
      dev?: unknown;
      pid?: unknown;
      uptime_s?: unknown;
    };
    if (body.app !== 'glasshive' || body.dev !== dev) return { kind: 'absent' };
    return {
      kind: 'observed',
      instance: {
        origin,
        /* 自己申告が一致したなら居る。**居るかどうかの答えを、添え物のせいで変えない**
           —— 古い glasshive が相手でも、使い回せることに変わりはない。 */
        pid: typeof body.pid === 'number' ? body.pid : null,
        uptimeSecs: typeof body.uptime_s === 'number' ? body.uptime_s : null,
      },
    };
  } catch {
    return signal.aborted ? { kind: 'unobservable' } : { kind: 'absent' };
  }
}

/* そこに居る、使い回せる glasshive。居なければ `null`。

   **ここでは観測できなかったものを「居ない」に畳んでよい。** 呼ぶのは立ち上げに来た側で、
   居ないと答えれば自分で立ち上げる —— 握られたままのポートなら、そこで待てずに次の空きへ
   落ちるので、畳んだことがその場で正される。報告するだけの `--status` と `--stop` は
   自分で正しようがないので、そちらは `probeGlasshive` の答えをそのまま運ぶ。 */
export async function askGlasshive(origin: string, dev: boolean): Promise<RunningInstance | null> {
  const probe = await probeGlasshive(origin, dev);
  return probe.kind === 'observed' ? probe.instance : null;
}

/** そこに居るのが glasshive か。居場所だけを見たいところはこちらを使う */
export const isGlasshive = async (origin: string, dev: boolean): Promise<boolean> =>
  (await askGlasshive(origin, dev)) !== null;

/** 範囲を尋ねた答え。**見つけたものと、確かめられなかったポートの両方を持って帰る** */
export interface Survey {
  readonly running: readonly RunningInstance[];
  readonly unobservable: readonly string[];
}

/* 範囲を尋ねる。番号の小さいほうから並ぶ。

   範囲の全部に一度に尋ねる。順に尋ねると、答えない相手が 1 つ在るだけでそのぶん待たされ、
   **立ち上がるのが遅い glasshive** という形で使う人に出る。

   **1 つに保つと決めていても、2 つ以上見つかることは在る。** そう決める前に立ち上げたもの、
   `--port` で別の番号を名指して立てたもの、閉じ忘れたもの。居場所を訊きに来た人に 1 つだけ
   答えると、残りは見えないまま動き続ける。

   答えなかったポートを落とさずに返す。**「見つからなかった」で括ると、そこに居るかどうかを
   確かめられなかったことが、居ないことになる。** */
export async function surveyRange(
  range: { readonly first: number; readonly attempts: number },
  dev: boolean,
): Promise<Survey> {
  const origins = Array.from(
    { length: range.attempts },
    (_, i) => `http://${LISTEN_ADDRESS}:${range.first + i}`,
  );
  const probed = await Promise.all(
    origins.map(async (origin) => ({ origin, probe: await probeGlasshive(origin, dev) })),
  );
  return {
    running: probed.flatMap(({ probe }) => (probe.kind === 'observed' ? [probe.instance] : [])),
    unobservable: probed.flatMap(({ origin, probe }) =>
      probe.kind === 'unobservable' ? [origin] : [],
    ),
  };
}

/* 範囲に居る glasshive を全部見つける。

   確かめられなかったポートは落ちる。**呼んでよいのは、居ないと答えられたら自分で立ち上げる
   側だけである** —— 報告するだけの求めは `surveyRange` を使う。 */
export const findAllRunning = async (
  range: { readonly first: number; readonly attempts: number },
  dev: boolean,
): Promise<readonly RunningInstance[]> => (await surveyRange(range, dev)).running;

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

/** 止めに行った結果。**自分で終わっていたのと、こちらが止めたのは別である** */
export type Stopped = 'stopped' | 'already gone';

/* 走っている glasshive を終わらせる。

   **終わったことを見届けてから戻る。** 答えが返っただけでは、まだポートを握っている ——
   止めた直後に立ち上げ直す人が、自分が止めたサーバーに弾かれる。

   調べてからここへ来るまでのあいだに、相手が自分で終わっていることは在る。**それは
   止めそこねたことではない** —— 止まっているものを止めようとしたことを誤りにすると、
   後片付けのスクリプトが毎回そこで転ぶ。 */
export async function stopAt(instance: RunningInstance): Promise<Stopped> {
  /* 待つ時間を区切る。**区切らないと、受け取っておいて答えないサーバーを相手に
     `--stop` が終わらない。** 止まらないものを待ち続けるより、待ったことを言って終わる。 */
  const signal = AbortSignal.timeout(PROBE_TIMEOUT_MS);
  let response: Response;
  try {
    response = await fetch(`${instance.origin}/api/quit`, {
      method: 'POST',
      headers: { [COMMAND_HEADER]: COMMAND_HEADER_VALUE },
      signal,
      /* ここでも転送先を追わない。**追うと、コマンドラインのヘッダーを付けた POST を、名指して
         いない相手へ運ぶことになる。** 3xx は `ok` ではないので、止められなかったこととして
         落ちる。 */
      redirect: 'manual',
    });
  } catch {
    /* 求めが届かなかった。**届かなかった理由から「もう居ない」を推測しない** —— ポートを
       見に行けば済むことである。握りが解けていれば、調べてからここへ来るまでに自分で
       終わったということで、それは止めそこねたことではない。

       時間切れだけは見に行くまでもない。相手はまだ握ったまま、答えられないだけである。 */
    if (signal.aborted) throw new Error(cannotTell(instance.origin));
    await waitUntilGone(instance.origin);
    return 'already gone';
  }
  if (!response.ok) {
    /* 断られた理由は相手の言葉で出すが、**どれが断ったのかは必ずこちらが添える** ——
       2 つ以上見つかったときに理由だけを出すと、どのポートの話なのかが分からない。 */
    const body = (await response.json().catch(() => null)) as { message?: unknown } | null;
    throw new Error(
      typeof body?.message === 'string'
        ? `could not stop ${instance.origin}: ${body.message}`
        : `could not stop ${instance.origin}`,
    );
  }
  await response.arrayBuffer();
  await waitUntilGone(instance.origin);
  return 'stopped';
}

/** 見届けられなかったときの言い方。**言うのは 1 か所** —— 求めの側でも見届けの側でも同じ */
const cannotTell = (origin: string): string =>
  `could not tell whether ${origin} stopped — it is not answering`;

/** 見届けるのを諦めるまで。止まらないサーバーを待ち続けるより、待ったことを言って終わる */
const GONE_TIMEOUT_MS = 5000;

/** 見届けるあいだ、どれだけ置いて尋ね直すか */
const GONE_INTERVAL_MS = 50;

async function waitUntilGone(origin: string): Promise<void> {
  const until = Date.now() + GONE_TIMEOUT_MS;
  let last: Grip = 'unknown';
  while (Date.now() < until) {
    await new Promise((resolve) => setTimeout(resolve, GONE_INTERVAL_MS));
    last = await gripAt(origin);
    if (last === 'released') return;
  }
  /* 見届けられなかったことを、止まらなかったことと同じ言葉で言わない。**待った末に
     分からなかったのなら、分からなかったと言う** —— 「止まらなかった」は、こちらが
     観測して言えたときの言葉である。 */
  throw new Error(last === 'unknown' ? cannotTell(origin) : `${origin} did not stop`);
}

/** そのポートの握り。**繋げなかったのと、握りが解けたのは別である** */
type Grip = 'held' | 'released' | 'unknown';

/* そこがまだ握っているか。

   **HTTP では訊かない。** 知りたいのはポートが空いたことであって、相手が何を喋るかではない
   —— 繋いだ先が接続を壊しても、繋げたのならそのポートは握られている。`fetch` で訊くと壊された
   ことが「繋げなかった」に見え、握られたままのポートを「止まった」と言うことになる。

   繋ぐのを断られたのなら、握りは解けている。**時間切れは違う** —— 断られも繋がりもしないなら、
   こちらからは分からない。loopback には名前解決も TLS も無いので、断りは `ECONNREFUSED` で
   届く。それ以外の理由は、握りについて何も言っていないので「分からなかった」に落とす。 */
function gripAt(origin: string): Promise<Grip> {
  const { hostname, port } = new URL(origin);
  return new Promise((resolve) => {
    const socket = net.connect({ host: hostname, port: Number(port) });
    const settle = (grip: Grip): void => {
      socket.destroy();
      resolve(grip);
    };
    socket.setTimeout(PROBE_TIMEOUT_MS, () => settle('unknown'));
    socket.once('connect', () => settle('held'));
    socket.once('error', (error) =>
      settle((error as NodeJS.ErrnoException).code === 'ECONNREFUSED' ? 'released' : 'unknown'),
    );
  });
}
