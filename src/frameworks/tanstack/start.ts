import { createCsrfMiddleware, createMiddleware, createStart } from '@tanstack/react-start';

const LOCAL_HOSTS = new Set(['127.0.0.1', 'localhost', '::1', '[::1]']);

/* ローカル以外の `Host` を名乗るリクエストは、どのコントローラーへも通さない。

   127.0.0.1 に縛るだけでは足りない。ホスト名だけをローカルへ差し替えたリクエストは、
   ブラウザーから見て同じオリジンに化けるので、オリジンの照合(CORS)は効かない。glasshive は
   `transcript` の全文・git の履歴・課題の中身を配るので、化けたリクエストが通れば中身が
   そのまま外へ運ばれる。

   本番はランチャーが、開発中は Vite が同じことを先に断る。ここは server route と
   server function の手前に置く 3 つ目のガードで、どの経路から入っても同じ言葉で断る。 */
const localHostOnly = createMiddleware().server(({ next, request }) => {
  const host = (request.headers.get('host') ?? '').replace(/:\d+$/, '');
  if (!LOCAL_HOSTS.has(host)) throw new Response('forbidden host', { status: 403 });
  return next();
});

/* 呼び出しが、この画面から出たものかを確かめる。

   server function は同じオリジンどうしの呼び出しを前提にしている。よそのページに置かれた
   script から同じポートを叩かれると、ブラウザーはローカルのページと同じ資格でリクエストを
   出してしまう — `Host` の照合は「ローカルを名乗っているか」しか見ないので、これは素通りする。

   **確かめるのは server function だけである。** 変更通知の SSE は `EventSource` が開き、
   `Origin` を送らずに繋ぐことがあるので、同じ物差しを当てると自分の画面が繋がらない。
   SSE のルートは `Host` の照合が守る。 */
const sameOriginServerFns = createCsrfMiddleware({
  filter: (ctx) => ctx.handlerType === 'serverFn',
});

export const startInstance = createStart(() => ({
  requestMiddleware: [localHostOnly, sameOriginServerFns],
}));
