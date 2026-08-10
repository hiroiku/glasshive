import { observed, unobservable } from '~/app-kernel/observation.ts';
import {
  AVATAR_REJECTED,
  AVATAR_UNREACHABLE,
  type AvatarIntegration,
} from '~/application/ports/integrations/issues/avatar.integration.ts';
import { AvatarReadError } from '~/infrastructure/errors/issues/avatar-read.error.ts';

/* 顔の画像を読む。**ここが GitHub の CDN に触る唯一の場所である。**

   `gh` を使わない。`gh` が話せるのは API のホストだけで、顔はそこには無い。
   代わりに、行ってよい宛先を呼ぶ側が決めている(`avatar-cache.service.ts`)。 */

/** 待つ上限。顔 1 枚のために課題の画面を止めない */
const TIMEOUT_MS = 5_000;

/** 受け取る上限。48px の PNG は実測 5KB 弱なので、これでも 200 倍の余裕がある */
const MAX_BYTES = 1024 * 1024;

/** 画像でないものを画像として返さない */
const IMAGE_TYPE = /^image\//;

export interface HttpAvatarOptions {
  /** テストで差し替える。既定は Node の `fetch` */
  readonly fetch?: typeof globalThis.fetch;
  readonly timeoutMs?: number;
}

export function createHttpAvatarIntegration(options?: HttpAvatarOptions): AvatarIntegration {
  const call = options?.fetch ?? globalThis.fetch;
  const timeoutMs = options?.timeoutMs ?? TIMEOUT_MS;

  return {
    async fetchAvatar({ url, ifNoneMatch }) {
      const headers: Record<string, string> = { accept: 'image/*' };
      // 覚えてある `ETag` を送り返す。変わっていなければ本文は返ってこない
      if (ifNoneMatch !== null) headers['if-none-match'] = ifNoneMatch;

      let response: Response;
      try {
        response = await call(url, {
          headers,
          // 資格情報は送らない。顔は誰でも読める
          credentials: 'omit',
          redirect: 'follow',
          signal: AbortSignal.timeout(timeoutMs),
        });
      } catch (error) {
        return unobservable(
          new AvatarReadError('Could not reach the avatar host', AVATAR_UNREACHABLE, {
            cause: error,
            details: { url },
          }),
        );
      }

      if (response.status === 304) return observed({ kind: 'unchanged' });

      if (!response.ok) {
        return unobservable(
          new AvatarReadError('The avatar host refused', AVATAR_REJECTED, {
            details: { url, status: response.status },
          }),
        );
      }

      const contentType = response.headers.get('content-type') ?? '';
      if (!IMAGE_TYPE.test(contentType)) {
        return unobservable(
          new AvatarReadError('The avatar host answered with something else', AVATAR_REJECTED, {
            details: { url, contentType },
          }),
        );
      }

      let bytes: ArrayBuffer;
      try {
        bytes = await response.arrayBuffer();
      } catch (error) {
        return unobservable(
          new AvatarReadError('The avatar did not arrive whole', AVATAR_UNREACHABLE, {
            cause: error,
            details: { url },
          }),
        );
      }

      if (bytes.byteLength > MAX_BYTES) {
        return unobservable(
          new AvatarReadError('The avatar is larger than we read', AVATAR_REJECTED, {
            details: { url, bytes: bytes.byteLength },
          }),
        );
      }

      return observed({
        kind: 'image',
        image: { bytes, contentType, etag: response.headers.get('etag') },
      });
    },
  } satisfies AvatarIntegration;
}

/** テストから見える形で置いておく。上限そのものが確かめたいことだからである */
export const AVATAR_LIMITS = { TIMEOUT_MS, MAX_BYTES } as const;
