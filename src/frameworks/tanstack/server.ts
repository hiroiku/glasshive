import handler, { createServerEntry } from '@tanstack/react-start/server-entry';

/* サーバー側の入口。これが `dist/server/server.js` になり、ランチャーがここを `fetch` で叩く。
   自分で置いているのは、出力先のファイル名を決めておかないと、ランチャーから参照するパスが
   バージョンごとに動くためである。 */
export default createServerEntry({
  fetch(request) {
    return handler.fetch(request);
  },
});
