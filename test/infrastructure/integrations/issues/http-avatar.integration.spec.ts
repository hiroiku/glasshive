import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import { createHttpAvatarIntegration } from '~/infrastructure/integrations/issues/http-avatar.integration.ts';

/* 顔を読むところ。**本物の HTTP を通す。**

   ここで確かめたいのは「相手がこう答えたときに、こちらがどう答えるか」なので、
   `fetch` を偽物に差し替えると何も確かめたことにならない。127.0.0.1 に本物のサーバーを
   立てて、相手の答え方だけをこちらで決める。 */

const PNG = Uint8Array.from([0x89, 0x50, 0x4e, 0x47]);

let running: Server | null = null;

afterEach(async () => {
  const server = running;
  running = null;
  if (server !== null) await new Promise((done) => server.close(done));
});

/** 答え方を決めた相手を 1 つ立てて、その URL を返す */
async function hostOf(
  answer: (request: { ifNoneMatch: string | undefined }) => {
    status: number;
    contentType?: string;
    etag?: string;
    body?: Uint8Array;
  },
): Promise<string> {
  const server = createServer((request, response) => {
    const decided = answer({ ifNoneMatch: request.headers['if-none-match'] });
    const headers: Record<string, string> = {};
    if (decided.contentType !== undefined) headers['content-type'] = decided.contentType;
    if (decided.etag !== undefined) headers.etag = decided.etag;
    response.writeHead(decided.status, headers);
    response.end(decided.body === undefined ? undefined : Buffer.from(decided.body));
  });
  running = server;
  await new Promise<void>((ready) => server.listen(0, '127.0.0.1', ready));
  const { port } = server.address() as AddressInfo;
  return `http://127.0.0.1:${port}/u/1`;
}

describe('顔を読む', () => {
  it('画像はそのまま持ち帰り、`ETag` も添えて返す', async () => {
    const url = await hostOf(() => ({
      status: 200,
      contentType: 'image/png',
      etag: '"abc"',
      body: PNG,
    }));

    const answer = await createHttpAvatarIntegration().fetchAvatar({ url, ifNoneMatch: null });

    expect(answer.kind).toBe('observed');
    if (answer.kind !== 'observed' || answer.value.kind !== 'image')
      throw new Error('画像が来ない');
    expect(new Uint8Array(answer.value.image.bytes), '詰め替えずにそのまま運ぶ').toEqual(PNG);
    expect(answer.value.image.contentType).toBe('image/png');
    expect(answer.value.image.etag, '次に尋ねるとき、これを送り返す').toBe('"abc"');
  });

  it('覚えている `ETag` を送り、変わっていなければ本文を運ばない', async () => {
    const url = await hostOf(({ ifNoneMatch }) =>
      ifNoneMatch === '"abc"'
        ? { status: 304 }
        : { status: 200, contentType: 'image/png', etag: '"abc"', body: PNG },
    );

    const answer = await createHttpAvatarIntegration().fetchAvatar({
      url,
      ifNoneMatch: '"abc"',
    });

    expect(answer.kind).toBe('observed');
    expect(
      answer.kind === 'observed' && answer.value.kind,
      '変わっていないことを「取れた」に潰すと、覚えた顔を毎回捨てて取り直すことになる',
    ).toBe('unchanged');
  });

  it('画像でない答えを、画像として持ち帰らない', async () => {
    const url = await hostOf(() => ({
      status: 200,
      contentType: 'text/html',
      body: PNG,
    }));

    const answer = await createHttpAvatarIntegration().fetchAvatar({ url, ifNoneMatch: null });

    expect(answer.kind, 'ログイン画面の HTML を顔として並べない').toBe('unobservable');
  });

  it('断られたことを、顔が無いことにしない', async () => {
    const url = await hostOf(() => ({ status: 403 }));

    const answer = await createHttpAvatarIntegration().fetchAvatar({ url, ifNoneMatch: null });

    expect(answer.kind).toBe('unobservable');
    expect(answer.kind === 'unobservable' && answer.error.code).toBe('avatar.rejected');
  });

  it('繋がらなかったことと、断られたことを言い分ける', async () => {
    /* 誰も待っていない番号へ掛ける。**こちらの通信の話と、向こうの都合は別である** */
    const answer = await createHttpAvatarIntegration({ timeoutMs: 500 }).fetchAvatar({
      url: 'http://127.0.0.1:1/u/1',
      ifNoneMatch: null,
    });

    expect(answer.kind).toBe('unobservable');
    expect(answer.kind === 'unobservable' && answer.error.code).toBe('avatar.unreachable');
  });
});
