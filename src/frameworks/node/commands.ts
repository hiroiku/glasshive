import { findAllRunning, type RunningInstance, stopAt } from './instance.js';

/* サーバーを立てずに、走っているものへ尋ねるだけの求め。

   **サーバーを 1 つに保つと決めた以上、居場所を訊く手段と終わらせる手段が要る。** 立ち上げ
   だけが揃っていても、どのターミナルが持っているかを覚えていなければ止められないのでは、
   入口と出口が釣り合わない。

   見つけたものは全部言う。1 つに保つと決めていても、そう決める前に立ち上げたものや、
   `--port` で別の番号に立てたものが残っていることは在る —— **1 つだけ言うと、残りは
   見えないまま動き続ける。**

   開発中のものとビルドしたものは別に数えるので、どちらを相手にするかは呼ぶ側が渡す。 */

const MINUTE_S = 60;
const HOUR_S = 60 * MINUTE_S;
const DAY_S = 24 * HOUR_S;

/* 動いている長さの言い方。**桁を落として読めるようにする** —— ここで知りたいのは
   「さっき立てたものか、ずっと居るものか」であって、秒まで数えたい人は居ない。 */
export function formatUptime(seconds: number): string {
  if (seconds >= DAY_S) {
    return `${Math.floor(seconds / DAY_S)}d ${Math.floor((seconds % DAY_S) / HOUR_S)}h`;
  }
  if (seconds >= HOUR_S) {
    return `${Math.floor(seconds / HOUR_S)}h ${Math.floor((seconds % HOUR_S) / MINUTE_S)}m`;
  }
  if (seconds >= MINUTE_S) return `${Math.floor(seconds / MINUTE_S)}m`;
  return `${Math.max(0, Math.round(seconds))}s`;
}

/* 見つけたものの言い表し方。**プロセス id を出す** —— ターミナルを見失っても、これが在れば
   `ps` からでも辿れる。答えなかった glasshive には、無い欄を作り話で埋めない。 */
export const describe = (instance: RunningInstance): string =>
  instance.pid > 0
    ? `${instance.origin} (pid ${instance.pid}, up ${formatUptime(instance.uptimeSecs)})`
    : instance.origin;

/** 端末に出す相手。テストは本物の出力を汚さずに読める */
export interface Console {
  readonly log: (line: string) => void;
}

/** 尋ねて回るポートの範囲。**呼ぶ側が渡す** —— どこを見るかを決めるのは、打たれた引数である */
export interface PortRange {
  readonly first: number;
  readonly attempts: number;
}

const LABEL = 'glasshive: ';

/** 2 行目からは頭を空ける。名前を毎行繰り返すと、いくつ居るのかが読み取りにくい */
export const listed = (lines: readonly string[]): readonly string[] =>
  lines.map((line, i) => `${i === 0 ? LABEL : ' '.repeat(LABEL.length)}${line}`);

const listOut = (out: Console, lines: readonly string[]): void => {
  for (const line of listed(lines)) out.log(line);
};

/* 走っているものの居場所を言う。**走っていないことは誤りではない** —— 終了コードで分けるのは、
   これを条件に使うスクリプトのためである。 */
export async function reportStatus(
  range: PortRange,
  dev: boolean,
  out: Console = console,
): Promise<number> {
  const running = await findAllRunning(range, dev);
  if (running.length === 0) {
    out.log(`${LABEL}not running`);
    return 1;
  }
  listOut(out, running.map(describe));
  return 0;
}

/* 走っているものを終わらせる。見つけたものは全部止める —— 1 つに保つと言いながら残していけば、
   止めたはずのものが翌日まだ動いていることになる。

   **走っていなければ、それで望みは叶っている。** 止まっているものを止めようとしたことを
   誤りにすると、後片付けのスクリプトが毎回そこで転ぶ。 */
export async function stopRunning(
  range: PortRange,
  dev: boolean,
  out: Console = console,
): Promise<number> {
  const running = await findAllRunning(range, dev);
  if (running.length === 0) {
    out.log(`${LABEL}not running`);
    return 0;
  }
  /* 1 つずつ止める。まとめて頼むと、どれが止まってどれが残ったのかを、途中で失敗したときに
     言えなくなる。 */
  const stopped: string[] = [];
  for (const instance of running) {
    try {
      await stopAt(instance);
      stopped.push(`stopped ${describe(instance)}`);
    } catch (error) {
      listOut(out, stopped);
      throw error;
    }
  }
  listOut(out, stopped);
  return 0;
}
