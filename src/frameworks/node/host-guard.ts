/* `Host` ヘッダーがローカルを指しているかを見る。

   127.0.0.1 だけで待ち受けても、これが要る。よそのページが自分のホスト名をローカルの
   アドレスへ差し替えると、ブラウザーから見て同じオリジンに化けるので、オリジンの照合は効かない。
   glasshive は `transcript` の全文・git の履歴・課題の中身を配るから、化けたリクエストが
   通れば中身がそのまま外へ運ばれる。

   見るのはホスト名だけで、ポート番号は落とす — 待ち受けるポートは起動のたびに変わりうるが、
   ローカルを指すホスト名は限られている。 */

const LOCAL_HOSTS = new Set(['127.0.0.1', 'localhost', '::1', '[::1]']);

export function isLocalHost(host: string | undefined): boolean {
  if (host === undefined || host === '') return false;
  // "[::1]:4483" のような括弧付きも、"127.0.0.1:4483" も、末尾のポート番号だけを落とす
  const name = host.startsWith('[') ? host.replace(/\]:\d+$/, ']') : host.replace(/:\d+$/, '');
  return LOCAL_HOSTS.has(name);
}
