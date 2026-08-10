import { describe, expect, it } from 'vitest';
import { AppError } from '~/app-kernel/error.ts';
import { absent, observed, unobservable } from '~/app-kernel/observation.ts';
import { readAvatar } from '~/interface/controllers/issues/avatar.controller.ts';

/* 顔 1 枚の応答。

   ここで見るのは**ブラウザーが持っている仕組みに乗る形になっているか**である。
   `Cache-Control` と `ETag` が付いていなければ、同じ顔を開くたびに運び直すことになり、
   同じ origin にした意味が半分消える。 */

type Avatars = Parameters<typeof readAvatar>[0];

class Unreachable extends AppError {
  readonly code = 'avatar.unreachable';
}

const PNG = Uint8Array.from([0x89, 0x50, 0x4e, 0x47]);

const cacheOf = (answer: Awaited<ReturnType<Avatars['read']>>): Avatars => ({
  remember: () => undefined,
  warm: () => undefined,
  read: async () => answer,
});

const image = observed({
  bytes: PNG.buffer as ArrayBuffer,
  contentType: 'image/png',
  etag: '"abc"',
});

describe('顔 1 枚を返す', () => {
  it('画像と一緒に、覚えておく期間と `ETag` を渡す', async () => {
    const response = await readAvatar(cacheOf(image), 'hiroiku', null);

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('image/png');
    expect(response.headers.get('etag')).toBe('"abc"');
    expect(
      response.headers.get('cache-control'),
      '付けなければ、同じ顔を開くたびに運び直すことになる',
    ).toBe('private, max-age=86400');
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(PNG);
  });

  it('`immutable` にはしない', async () => {
    const response = await readAvatar(cacheOf(image), 'hiroiku', null);

    expect(
      response.headers.get('cache-control'),
      'GitHub の URL は人が顔を変えても変わらないことがあるので、1 年固定にすると古い顔が焼き付く',
    ).not.toContain('immutable');
  });

  it('変わっていなければ、本文を運ばない', async () => {
    const response = await readAvatar(cacheOf(image), 'hiroiku', '"abc"');

    expect(response.status).toBe(304);
    expect(
      (await response.arrayBuffer()).byteLength,
      '再確認が本文を運んでは、確認の意味が無い',
    ).toBe(0);
  });

  it('`ETag` が違えば、そのまま画像を返す', async () => {
    const response = await readAvatar(cacheOf(image), 'hiroiku', '"old"');

    expect(response.status).toBe(200);
  });

  it('引けない顔と、取れなかった顔を、同じ断り方にする', async () => {
    /* 断り方を書き分けると、尋ねて回るだけで誰が観測されているかが分かってしまう。
       顔が無いことは画面の側で頭文字に落ちるので、ここで説明する相手も居ない。 */
    const missing = await readAvatar(cacheOf(absent('no-source')), 'octocat', null);
    const broken = await readAvatar(
      cacheOf(unobservable(new Unreachable('繋がらない'))),
      'hiroiku',
      null,
    );

    expect(missing.status).toBe(404);
    expect(broken.status).toBe(404);
    expect(missing.headers.get('cache-control'), '無かったことを覚えさせない').toBe('no-store');
  });
});
