import type { Observation } from '~/app-kernel/observation.ts';

/* 顔の画像を取ってくるところ。

   **repository ではなく integration である。** 読むのは自分が形を知っているストアではなく、
   他人のサーバーが返す答えで、失敗の言葉も「繋がらない / 断られた / 遅い」になる。 */

/** 取ってきた画像 1 枚 */
export interface AvatarImage {
  /** 中身そのまま。**そのまま応答の本文にできる形で持つ** — 詰め替える理由が無い */
  readonly bytes: ArrayBuffer;
  readonly contentType: string;
  /** 相手が付けた `ETag`。次に尋ねるときそのまま送り返す */
  readonly etag: string | null;
}

/* 尋ねた結果。

   **`unchanged` を `observed` に潰さない。** 変わっていないことが分かれば本文は運ばずに済み、
   その判断ができるのはここだけである。潰すと、覚えてある画像を毎回捨てて取り直すことになる。 */
export type AvatarAnswer =
  | { readonly kind: 'image'; readonly image: AvatarImage }
  | { readonly kind: 'unchanged' };

export interface AvatarRequest {
  /** 取ってくる先。呼ぶ側が観測した URL しか渡さない */
  readonly url: string;
  /** 覚えてある `ETag`。付けて尋ねると、変わっていなければ本文が返らない */
  readonly ifNoneMatch: string | null;
}

export interface AvatarIntegration {
  fetchAvatar(request: AvatarRequest): Promise<Observation<AvatarAnswer>>;
}

/* 取ってこられなかった理由。ユーザーに見せるのではなく、記録に残すための言葉。

   繋がらなかったのと、断られたのを分ける。前者はこちらの通信の話で、後者は向こうの都合である。 */
export const AVATAR_UNREACHABLE = 'avatar.unreachable';
export const AVATAR_REJECTED = 'avatar.rejected';

export type AvatarFailureCode = typeof AVATAR_UNREACHABLE | typeof AVATAR_REJECTED;
