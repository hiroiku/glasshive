import { createMiddleware, createStart } from '@tanstack/react-start';

const LOCAL_HOSTS = new Set(['127.0.0.1', 'localhost', '::1', '[::1]']);

/* 手元以外を名乗る求めは、どの窓へも通さない。

   127.0.0.1 に縛るだけでは足りない。名前だけを手元へ差し替えた求めは、ブラウザーから見て
   同じ出所に化けるので、出所の照合(CORS)は効かない。この道具は正本の全文・git の履歴・
   課題の中身を配るので、化けた求めが通れば中身がそのまま外へ運ばれる。

   本番は起動口が、開発中は Vite が同じことを先に断る。ここは server route と server function の
   手前を守る三枚目で、どの経路から入っても同じ言葉で断ることを担保する。 */
const localHostOnly = createMiddleware().server(({ next, request }) => {
  const host = (request.headers.get('host') ?? '').replace(/:\d+$/, '');
  if (!LOCAL_HOSTS.has(host)) throw new Response('forbidden host', { status: 403 });
  return next();
});

export const startInstance = createStart(() => ({
  requestMiddleware: [localHostOnly],
}));
