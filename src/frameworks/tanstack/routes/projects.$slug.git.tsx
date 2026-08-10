import { createFileRoute, redirect } from '@tanstack/react-router';

/* 古い `/projects/$slug/git` を Work へ送る。

   ブックマークと、人に渡した URL を生かしておくためである。検索パラメータを読むのは親の
   `/projects/$slug` なので、Git の画面に載るものは Work でもそのまま通る。
   **そのまま渡す** — 落とすと `panel` の指すパネルが閉じたまま出て、URL を渡した意味が消える。 */

export const Route = createFileRoute('/projects/$slug/git')({
  beforeLoad: ({ params, search }) => {
    throw redirect({
      to: '/projects/$slug/work',
      params,
      /* この URL が指しているのはブランチの一覧である。`unit` を足さずに送ると
         既定の課題の一覧が開き、同じ URL が別の画面を指すことになる。 */
      search: { ...search, unit: 'branches' },
      replace: true,
    });
  },
});
