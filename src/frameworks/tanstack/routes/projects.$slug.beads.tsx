import { createFileRoute, redirect } from '@tanstack/react-router';

/* 古い `/projects/$slug/beads` を Work へ送る。

   Beads の画面が見せていたのは課題の一覧で、Work もそれを見せる。行き先が在るあいだは、
   ブックマークと人に渡した URL を生かしておく。**`unit` の他はそのまま渡す** — 落とすと
   `panel` の指すパネルが閉じたまま出て、URL を渡した意味が消える。 */

export const Route = createFileRoute('/projects/$slug/beads')({
  beforeLoad: ({ params, search }) => {
    throw redirect({
      to: '/projects/$slug/work',
      params,
      /* この URL が指しているのは課題の一覧で、Work の既定の単位もそれである。手で書き足された
         `unit` を運ぶと、古い URL が見せていなかった単位で開くので、そこだけ落とす。 */
      search: { ...search, unit: undefined },
      replace: true,
    });
  },
});
