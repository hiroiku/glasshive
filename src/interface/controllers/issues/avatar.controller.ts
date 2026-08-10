import type { AvatarCacheService } from '~/application/services/issues/avatar-cache.service.ts';

/* 顔 1 枚を返す。

   ふつうの画像の応答である。だからブラウザーが持っている仕組みがそのまま効く ——
   HTTP のキャッシュ、遅延読み込み、メインスレッドを離れたデコード、再描画をまたいだ再利用。
   課題の応答に画像を埋めると、そのどれも効かないうえ、取り直すたびに運び直しになる。

   **知らない login は 404 にする。** 引ける先はいまの一覧が観測した顔だけで、
   観測していない login は「まだ読んでいない」ではなく「そんな顔は知らない」である。 */

/** ブラウザーに覚えておいてもらう間。過ぎたら確かめに来るが、変わっていなければ本文は運ばない */
const MAX_AGE_SECONDS = 24 * 60 * 60;

export async function readAvatar(
  avatars: AvatarCacheService,
  login: string,
  ifNoneMatch: string | null,
): Promise<Response> {
  const answer = await avatars.read(login);

  /* 観測していない login も、取ってこられなかった顔も、返すものが無いのは同じである。
     **理由を書き分けない** —— 尋ねて回るだけで、誰が観測されているかが分かってしまう。
     顔が無いことは画面の側で頭文字に落ちるので、ここで説明する相手も居ない。 */
  if (answer.kind !== 'observed') {
    return new Response(null, { status: 404, headers: { 'cache-control': 'no-store' } });
  }

  const { bytes, contentType, etag } = answer.value;

  /* 相手が付けた `ETag` をそのまま使う。**中身が変わっていなければ、本文は運ばない。**
     GitHub の `ETag` は中身の hash なので、こちらで作り直す意味が無い。 */
  if (etag !== null && ifNoneMatch === etag) {
    return new Response(null, {
      status: 304,
      headers: { etag, 'cache-control': `private, max-age=${MAX_AGE_SECONDS}` },
    });
  }

  const headers: Record<string, string> = {
    'content-type': contentType,
    'content-length': String(bytes.byteLength),
    /* `immutable` にはしない。GitHub の URL に付く `?v=4` は API のバージョンであって
       中身のバージョンではないので、人が顔を変えたときに URL が変わる保証が無い。
       1 年固定にすると古い顔が焼き付く。 */
    'cache-control': `private, max-age=${MAX_AGE_SECONDS}`,
  };
  if (etag !== null) headers.etag = etag;

  return new Response(bytes, { status: 200, headers });
}
