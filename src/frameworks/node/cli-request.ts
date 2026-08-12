/* コマンドラインから来た求めであることを示すヘッダーと、その見分け方。

   **ディレクトリを名指せるのはコマンドラインだけである。** 画面から名指せると、開いている
   どのページも任意のディレクトリを glasshive に読ませられる —— そこがリポジトリかどうかを
   片端から尋ねて回れることになり、観測していない場所が一覧に生える。

   見分けるのに独自のヘッダーを使う。**ブラウザーはこのヘッダーを付けて送れない** ——
   別のオリジンから独自のヘッダーを付けると preflight が要り、こちらはそれに答えないので
   本来の求めは飛ばない。`<form>` はヘッダーそのものを付けられない。
   `Sec-Fetch-Mode` や `User-Agent` では見分けられない —— Node の `fetch` も
   `sec-fetch-mode` を付けて送るので、それを見るとコマンドの求めまで断ることになる。

   送る側と見分ける側を 1 つのファイルに置いてある。離すと、片方だけ名前が変わった日に
   glasshive が自分自身の求めを断る。 */

export const COMMAND_HEADER = 'x-glasshive-command';

export const COMMAND_HEADER_VALUE = '1';

export const fromCommandLine = (headers: Headers): boolean =>
  headers.get(COMMAND_HEADER) === COMMAND_HEADER_VALUE && !headers.has('origin');
