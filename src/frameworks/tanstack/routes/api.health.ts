import { createFileRoute } from '@tanstack/react-router';

/* 走っているのが glasshive かどうかを、立ち上げに来たコマンドが確かめるための 1 行。

   サーバーは 1 つに保つ。2 枚目以降の `glasshive` は自分で立ち上がらずに、既に走って
   いるものへ開きたいディレクトリを伝えに行く —— **走査も索引も、その 1 つが持っている
   ものを使い回せる。** そのために、まず「そこに居るのは誰か」を尋ねる必要がある。

   **開発中のものと、ビルドしたものは別に数える。** 開発中の glasshive が、ビルドされた
   glasshive を使い回してしまうと、書いたばかりのコードが画面に出ない。

   プロセス id と動いている長さを添える。1 つに保つと決めた以上、**どのターミナルが持って
   いるかを覚えていなくても訊けなければならない** —— `--status` が出すのはこの 2 つである。

   観測は 1 つも出さない。ここが答えるのは glasshive 自身のことだけである。 */

export const Route = createFileRoute('/api/health')({
  server: {
    handlers: {
      GET: () =>
        Response.json(
          {
            app: 'glasshive',
            dev: import.meta.env.DEV === true,
            pid: process.pid,
            uptime_s: Math.round(process.uptime()),
          },
          { headers: { 'cache-control': 'no-store' } },
        ),
    },
  },
});
