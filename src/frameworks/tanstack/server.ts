import handler, { createServerEntry } from '@tanstack/react-start/server-entry';

/* サーバー側の入口。これが dist/server/server.js になり、起動口がここを fetch で叩く。
   自分で置いているのは、出る名前を決めておかないと起動口から参照する道が版ごとに動くためである。 */
export default createServerEntry({
  fetch(request) {
    return handler.fetch(request);
  },
});
