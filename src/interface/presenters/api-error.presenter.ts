import type { AppError } from '~/app-kernel/error.ts';

/* 誤りを、外の道の言葉へ写す。

   写し方は名札(`code`)だけで決める。誤りの型を見に行かないので、どの層で起きた
   誤りでも、この 1 枚の表を足すだけで外へ出せる。

   線の引き方は 1 つだけ決めてある。**見に行けたが無かったものは誤りではない。**
   それは 200 と「無い」という値で返すものであり、ここへは来ない。ここへ来るのは
   求めを断るか、見に行けなかったか、こちらが壊れたかのどれかである。 */

export type ApiStatus = 200 | 400 | 403 | 404 | 500 | 503;

export interface ApiErrorBody {
  /** `invalid` = 求めの側の誤り、`unobservable` = こちらが答えを出せなかった */
  state: 'invalid' | 'unobservable';
  code: string;
  message: string;
}

/* 断りを載せて返す窓の答え。

   見分けるのは番号ではなく `ok` である。番号は断られたときにしか意味を持たないので、
   それで見分けさせると、受け取る側が「200 だが誤り」を扱う羽目になる。 */
export type ApiResponse<T> =
  | { readonly ok: true; readonly body: T }
  | {
      readonly ok: false;
      readonly status: ApiStatus;
      readonly body: ApiErrorBody;
    };

const STATUS_BY_CODE: Record<string, ApiStatus> = {
  // 求めの形が違う
  'workspace.invalid_path': 400,
  'workspace.invalid_action': 400,
  'sessions.invalid_request': 400,
  'git.invalid_revision': 400,
  // 読んでよい場所の外
  'workspace.out_of_scope': 403,
  /* 書いてよい場所の外。**503 ではない。**
     置き場を変えるまで何度求めても同じで、再試行で通る見込みが無い。 */
  'preferences.refused': 403,
  // 観測していない正本を開こうとした
  'transcript.out_of_scope': 403,
  // 観ていないものを尋ねられた
  'project.not_observed': 404,
  'session.not_observed': 404,
  /* こちらが壊れた。**503 ではない。**
     503 は「今は無理だが、もう一度求めれば通るかもしれない」という意味で、
     説明の付かない誤りにそれを言うと、直らない求めを永久に叩かせることになる。
     旧実装も、拾えなかった例外はここ(500)へ落としていた。 */
  unexpected: 500,
  // 見に行けなかった
  'transcript.unreadable': 503,
  'ledger.unreadable': 503,
  'preferences.unreadable': 503,
  // 置きに行けなかった。断ったのではないので、次に求めれば通るかもしれない
  'preferences.unwritable': 503,
  'process.uninspectable': 503,
  'transcript.watch_unavailable': 503,
  /* 記録を読む道具の側の事情。**そこがリポジトリでないことはここへ来ない** —
     見に行けたうえで無かったのだから、200 と空の値で返る。 */
  'git.not_installed': 503,
  'git.denied': 503,
  'git.timeout': 503,
  'git.exit_nonzero': 503,
};

/** 求めの側の落ち度として返す番号。ここに無い番号は、こちらの側の事情である */
const REQUEST_FAULT_STATUSES: readonly ApiStatus[] = [400, 403, 404];

/* 知らない名札は 503 に倒す。

   名札が表に無いということは、こちらがその誤りを想定できていないということで、
   求めた側に落ち度があるとは言えない。「今は答えられない」と言って、
   もう一度求めれば直るかもしれない側に倒すのが安全である。

   **表に在るかは、表自身の持ち物かで決める。** 素の索きだと `__proto__` や `constructor`
   が土台から生えてきて、番号でないものが番号として外へ出る。 */
export function statusForCode(code: string): ApiStatus {
  if (!Object.hasOwn(STATUS_BY_CODE, code)) return 503;
  return STATUS_BY_CODE[code] ?? 503;
}

export function presentError(error: AppError): {
  status: ApiStatus;
  body: ApiErrorBody;
} {
  const status = statusForCode(error.code);
  return {
    status,
    body: {
      /* 番号から導く。番号ごとに手で書くと、表を足したときに片方だけ直り、
         「400 なのに見に行けなかった」のような食い違いが生まれる。 */
      state: REQUEST_FAULT_STATUSES.includes(status) ? 'invalid' : 'unobservable',
      code: error.code,
      message: error.message,
    },
  };
}
