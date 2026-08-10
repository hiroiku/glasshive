import { createFileRoute, redirect } from '@tanstack/react-router';

/* 古い `/projects/$slug/beads` を Work へ送る。

   ブックマークと、人に渡した URL を生かしておくためである。この URL が指している課題の一覧は
   Work の既定の単位なので、`unit` は足さない — 足さずに送ればそこが開く。検索パラメータを
   読むのは親の `/projects/$slug` なので、**そのまま渡す** — 落とすと `panel=issue` の指す
   課題が開かなくなる。 */

export const Route = createFileRoute('/projects/$slug/beads')({
  beforeLoad: ({ params, search }) => {
    throw redirect({
      to: '/projects/$slug/work',
      params,
      search,
      replace: true,
    });
  },
});
