import type { Action } from './cli.js';
import {
  findAllRunning,
  portsToTry,
  type RunningInstance,
  type Survey,
  stopAt,
  surveyRange,
} from './instance.js';

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
   `ps` からでも辿れる。

   答えなかった欄は書かない。**片方だけ答えた glasshive から、答えたほうまで落とさない**
   —— `pid` を出さない相手でも、動いている長さは出せるなら出す。 */
export const describe = (instance: RunningInstance): string => {
  const known = [
    instance.pid !== null ? `pid ${instance.pid}` : null,
    instance.uptimeSecs !== null ? `up ${formatUptime(instance.uptimeSecs)}` : null,
  ].filter((part) => part !== null);
  return known.length === 0 ? instance.origin : `${instance.origin} (${known.join(', ')})`;
};

/** 端末に出す相手。テストは本物の出力を汚さずに読める */
export interface Console {
  readonly log: (line: string) => void;
  readonly error: (line: string) => void;
}

/** 尋ねて回るポートの範囲。**呼ぶ側が渡す** —— どこを見るかを決めるのは、打たれた引数である */
export interface PortRange {
  readonly first: number;
  readonly attempts: number;
}

const LABEL = 'glasshive: ';

/* こちらの側に居なくても、もう片方が握っていることは在る。**黙って「居ない」で終えない** ——
   開発中のものとビルドしたものは別に数えるので、片方から見て居ないことは、そのポートが
   空いていることではない。止め方まで言わないと、見つけた人は次に何をすればよいか分からない。

   ここは `findAllRunning` でよい。**添えるだけの行であって、答えそのものではない。** 呼ばれる
   のはこちらの側のどのポートも答えたときだけなので、そのあと黙った相手が居ても、出ないのは
   案内の 1 行であって「走っていない」という答えのほうは観測できている。 */
async function otherSide(range: PortRange, dev: boolean): Promise<readonly string[]> {
  const running = await findAllRunning(range, !dev);
  if (running.length === 0) return [];
  const what = dev ? 'a packaged glasshive' : 'a development glasshive';
  const how = dev ? '`glasshive --stop`' : '`npm run dev -- --stop`';
  return [...running.map((one) => `${what} is at ${describe(one)}`), `stop it with ${how}`];
}

/** 2 行目からは頭を空ける。名前を毎行繰り返すと、いくつ居るのかが読み取りにくい */
export const listed = (lines: readonly string[]): readonly string[] =>
  lines.map((line, i) => `${i === 0 ? LABEL : ' '.repeat(LABEL.length)}${line}`);

const listOut = (out: Console, lines: readonly string[]): void => {
  for (const line of listed(lines)) out.log(line);
};

/* 自分の側が 1 つも居ないときの言い方。居ないことと、こちらの側には居ないことは別である */
const absent = async (range: PortRange, dev: boolean): Promise<readonly string[]> => [
  'not running',
  ...(await otherSide(range, dev)),
];

/* 確かめられなかったポートの言い方。

   **握られていることまでは観測できている。** 127.0.0.1 で時間切れになったということは、
   繋がりはしたということである —— 誰も待ち受けていなければ繋がらずに終わり、それは
   「無かった」に落ちる。だから「見つからなかった」ではなく「答えなかった」と書く。

   既定の範囲は 20 個あるので、glasshive でないものが 1 つ居るだけでこの行が出る。そのときは
   **次に何をすればよいかまで言う** —— `--port` で 1 つに絞れば、その相手を見に行かずに済む。
   名指して来た人には言わない。**もう打った指定を勧めても、次にすることが増えない。** */
const couldNotTell = (origins: readonly string[], range: PortRange): string =>
  `could not tell whether glasshive is at ${origins.join(', ')} — ${
    origins.length === 1 ? 'something holds that port' : 'something holds those ports'
  } and did not answer in time${range.attempts > 1 ? '; use --port to look at one port only' : ''}`;

/* 答えなかったポートが在ったなら、そこで終える。**報告するだけの求めは、自分の取りこぼしを
   後から正せない** —— 立ち上げに来た側と違って、間違えたまま次へ進む先が無い。

   誤りとして投げるので、出るのは stderr で、終了コードは 1 になる。走っていないことは
   stdout に出て `--stop` では 0 のままなので、**「無かった」と「観測できなかった」は
   受け取る側でも分かれる。** */
function refuseIfUnobservable(survey: Survey, range: PortRange): void {
  if (survey.unobservable.length > 0) throw new Error(couldNotTell(survey.unobservable, range));
}

/* 走っているものの居場所を言う。**走っていないことは誤りではない** —— 終了コードで分けるのは、
   これを条件に使うスクリプトのためである。 */
export async function reportStatus(
  range: PortRange,
  dev: boolean,
  out: Console = console,
): Promise<number> {
  const survey = await surveyRange(range, dev);
  if (survey.running.length === 0) {
    refuseIfUnobservable(survey, range);
    listOut(out, await absent(range, dev));
    return 1;
  }
  /* 見つかったものが在っても、答えなかったポートは添える。**1 つ見つけたことは、そこだけ
     しか居ないことの証しにはならない。** */
  listOut(out, [
    ...survey.running.map(describe),
    ...(survey.unobservable.length > 0 ? [couldNotTell(survey.unobservable, range)] : []),
  ]);
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
  const survey = await surveyRange(range, dev);
  const running = survey.running;
  if (running.length === 0) {
    /* **答えなかったポートが在るなら、止めたとは言えない。** ここで 0 を返すと、後片付けの
       スクリプトはポートが空いたものとして次へ進み、握ったままの glasshive に弾かれる。 */
    refuseIfUnobservable(survey, range);
    listOut(out, await absent(range, dev));
    return 0;
  }
  /* 1 つずつ止める。まとめて頼むと、どれが止まってどれが残ったのかを、途中で失敗したときに
     言えなくなる。 */
  const stopped: string[] = [];
  for (const [i, instance] of running.entries()) {
    try {
      /* 自分で終わっていたものを「止めた」と書かない。**望みは叶っているが、叶えたのは
         こちらではない** —— 何が起きたかを尋ねに来た人に、していないことを言わない。 */
      const outcome = await stopAt(instance);
      stopped.push(
        outcome === 'stopped'
          ? `stopped ${describe(instance)}`
          : `already gone: ${instance.origin}`,
      );
    } catch (error) {
      /* 止められなかった相手と、まだ尋ねてもいない相手を名指す。**止めたものだけ言うと、
         もう一度 `--stop` を打つべきかどうかが決まらない。** 答えなかったポートも同じ理由で
         ここに要る —— 決まっていないものを 1 つでも落とすと、残りが読めない。 */
      listOut(out, [
        ...stopped,
        `could not stop ${instance.origin}`,
        ...running.slice(i + 1).map((rest) => `still running, not asked: ${rest.origin}`),
        ...(survey.unobservable.length > 0 ? [couldNotTell(survey.unobservable, range)] : []),
      ]);
      throw error;
    }
  }
  /* 全部止まっても、答えなかったポートが在れば言い切らない。**止めたものは先に出してから
     誤りにする** —— どこまで進んだかが分からないまま終わらせない。 */
  listOut(out, stopped);
  refuseIfUnobservable(survey, range);
  return 0;
}

/* 走っているものに尋ねて終わるだけの求めを実行する。尋ねる求めでなければ `null`。

   **入口が 2 つあるので、ここに 1 か所だけ置く。** ランチャーと開発用のスクリプトで同じ
   引数が違う意味になってはいけないのに、それぞれで書くと、片方だけが失敗を捕まえるといった
   食い違いが黙って入る。 */
export async function runCommand(
  args: { readonly action: Action; readonly port: number | undefined },
  dev: boolean,
  out: Console = console,
): Promise<number | null> {
  if (args.action === 'serve') return null;
  const range = portsToTry(args.port);
  try {
    return args.action === 'status'
      ? await reportStatus(range, dev, out)
      : await stopRunning(range, dev, out);
  } catch (error) {
    /* 失敗の中身をそのまま出す。ここで理由を決め打つと、走っている glasshive に断られた
       ときに嘘の理由が出る。 */
    out.error(`${LABEL}${error instanceof Error ? error.message : String(error)}`);
    return 1;
  }
}
