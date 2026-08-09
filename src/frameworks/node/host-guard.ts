/* 名乗られた宛先が手元かどうかを見る。

   127.0.0.1 だけで待ち受けても、これが要る。よその頁が自分の名前を手元の番地へ差し替えると、
   ブラウザーから見て同じ出所に化けるので、出所の照合は効かない。この道具は正本の全文・
   git の履歴・課題の中身を配るから、化けた求めが通れば中身がそのまま外へ運ばれる。

   見るのは名前だけで、番号は落とす — 待ち受ける番号は起動のたびに変わりうるのに対し、
   手元を指す名前は限られている。 */

const LOCAL_HOSTS = new Set(['127.0.0.1', 'localhost', '::1', '[::1]']);

export function isLocalHost(host: string | undefined): boolean {
  if (host === undefined || host === '') return false;
  // "[::1]:4483" のような括弧付きも、"127.0.0.1:4483" も、末尾の番号だけを落とす
  const name = host.startsWith('[') ? host.replace(/\]:\d+$/, ']') : host.replace(/:\d+$/, '');
  return LOCAL_HOSTS.has(name);
}
