import type { AppError } from '~/app-kernel/error.ts';

/* 誤りを、外部 API の言葉へ写す。

   変換の仕方はエラーコード(`code`)だけで決める。誤りの型を見に行かないので、どの層で
   起きた誤りでも、この 1 枚の表を足すだけで外へ出せる。

   線の引き方は 1 つだけ決めてある。**観測はできたが対象が無かったものは誤りではない。**
   それは 200 と「無い」という値で返すものであり、ここへは来ない。ここへ来るのは
   リクエストを断るか、観測できなかったか、こちらが壊れたかのどれかである。 */

export type ApiStatus = 200 | 400 | 403 | 404 | 500 | 503;

export interface ApiErrorBody {
  /** `invalid` = リクエストの側の誤り、`unobservable` = こちらが結果を出せなかった */
  state: 'invalid' | 'unobservable';
  code: string;
  message: string;
}

/* 断りを載せて返すコントローラーのレスポンス。

   見分けるのは HTTP ステータスではなく `ok` である。ステータスは断られたときにしか
   意味を持たないので、それで見分けさせると、受け取る側が「200 だが誤り」を扱う羽目になる。 */
export type ApiResponse<T> =
  | { readonly ok: true; readonly body: T }
  | {
      readonly ok: false;
      readonly status: ApiStatus;
      readonly body: ApiErrorBody;
    };

const STATUS_BY_CODE: Record<string, ApiStatus> = {
  // リクエストの形が違う
  'workspace.invalid_path': 400,
  'workspace.invalid_action': 400,
  'sessions.invalid_request': 400,
  'git.invalid_revision': 400,
  // 読んでよいパスの外
  'workspace.out_of_scope': 403,
  /* 書いてよいパスの外。**503 ではない。**
     保存先を変えるまで何度求めても同じで、再試行で通る見込みが無い。 */
  'preferences.refused': 403,
  // 観測していない `transcript` を開こうとした
  'transcript.out_of_scope': 403,
  // 観測していないものを尋ねられた
  'project.not_observed': 404,
  'session.not_observed': 404,
  /* こちらが壊れた。**503 ではない。**
     503 は「今は無理だが、もう一度求めれば通るかもしれない」という意味で、
     説明の付かない誤りにそれを言うと、直らないリクエストを永久に叩かせることになる。
     どこでも拾えなかった例外も、このコードで 500 へ落ちる。 */
  unexpected: 500,
  // 観測できなかった
  'transcript.unreadable': 503,
  'ledger.unreadable': 503,
  'preferences.unreadable': 503,
  // 置きに行けなかった。断ったのではないので、次に求めれば通るかもしれない
  'preferences.unwritable': 503,
  'process.uninspectable': 503,
  'transcript.watch_unavailable': 503,
  /* `git` の側の事情。**そこがリポジトリでないことはここへ来ない** —
     観測はできたうえで無かったのだから、200 と空の値で返る。 */
  'git.not_installed': 503,
  'git.denied': 503,
  'git.timeout': 503,
  'git.exit_nonzero': 503,
};

/** リクエストの側の落ち度として返す HTTP ステータス。ここに無いステータスは、こちらの側の事情である */
const REQUEST_FAULT_STATUSES: readonly ApiStatus[] = [400, 403, 404];

/* 知らないエラーコードは 503 に倒す。

   エラーコードが表に無いということは、こちらがその誤りを想定できていないということで、
   求めた側に落ち度があるとは言えない。「今は答えられない」と言って、
   もう一度求めれば直るかもしれない側に倒すのが安全である。

   **表に在るかは、表自身の持ち物かで決める。** そのまま添字で引くと `__proto__` や
   `constructor` がプロトタイプから生えてきて、ステータスでないものがステータスとして
   外へ出る。 */
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
      /* HTTP ステータスから導く。ステータスごとに手で書くと、表を足したときに片方だけ直り、
         「400 なのに観測できなかった」のような食い違いが生まれる。 */
      state: REQUEST_FAULT_STATUSES.includes(status) ? 'invalid' : 'unobservable',
      code: error.code,
      message: error.message,
    },
  };
}
