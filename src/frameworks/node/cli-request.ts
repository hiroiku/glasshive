/* コマンドラインから来た求めであることを示すヘッダーと、その見分け方。

   **ディレクトリを名指せるのはコマンドラインだけである。** 画面から名指せると、開いている
   どのページも任意のディレクトリを glasshive に読ませられる —— そこがリポジトリかどうかを
   片端から尋ねて回れることになり、観測していない場所が一覧に生える。

   見分けるのに独自のヘッダーを使い、**`origin` が付いていないことも併せて見る。2 つとも
   要る。**

   ビルドしたランチャーが相手なら、独自のヘッダーは preflight を呼び、こちらはそれに
   答えないので本来の求めは飛ばない。`npm run dev` が相手だと違う —— Vite は loopback の
   オリジンに CORS を許すので preflight が通り、`x-glasshive-command` を付けた POST が
   実際に届く。そこで断っているのは `origin` の側だけである。**ヘッダーだけで足りると読んで
   `origin` の判定を外すと、同じ機械の別のポートで開いているどのページからでも通る。**

   `<form>` はヘッダーそのものを付けられない。`Sec-Fetch-Mode` や `User-Agent` では
   見分けられない —— Node の `fetch` も `sec-fetch-mode` を付けて送るので、それを見ると
   コマンドの求めまで断ることになる。

   送る側と見分ける側を 1 つのファイルに置いてある。離すと、片方だけ名前が変わった日に
   glasshive が自分自身の求めを断る。 */

export const COMMAND_HEADER = 'x-glasshive-command';

export const COMMAND_HEADER_VALUE = '1';

export const fromCommandLine = (headers: Headers): boolean =>
  headers.get(COMMAND_HEADER) === COMMAND_HEADER_VALUE && !headers.has('origin');
