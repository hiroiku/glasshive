import { afterEach, describe, expect, it, vi } from 'vitest';
import { probeGlasshive } from '~/frameworks/node/instance.ts';

/* 走っているのが glasshive かを、立ち上げに来たコマンドが確かめるための 1 行。

   **書く側と読む側を、同じテストの中で繋ぐ。** `app` `dev` `pid` `uptime_s` はここと
   `instance.ts` に手で書かれた文字列で、共有している定数が無い。片方だけ名前を変えても
   どちらのテストも通り、`--status` が黙って `up 0s` を出し続ける。ここでは実際のルートが
   返したものを、実際に読む側へそのまま渡す。 */

const { Route } = await import('~/frameworks/tanstack/routes/api.health.ts');

interface Handlers {
  readonly GET: () => Response | Promise<Response>;
}

/** 組み上がったルートのハンドラーをそのまま呼ぶ */
const get = async (): Promise<Response> => {
  const { handlers } = (Route.options as { server: { handlers: Handlers } }).server;
  return await handlers.GET();
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('そこに居るのが glasshive かを答える', () => {
  it('自分のことだけを答える', async () => {
    const body = (await (await get()).json()) as Record<string, unknown>;

    expect(Object.keys(body).sort(), '観測は 1 つも出さない').toEqual([
      'app',
      'dev',
      'pid',
      'uptime_s',
    ]);
    expect(body.app).toBe('glasshive');
    expect(body.pid).toBe(process.pid);
    expect(body.uptime_s).toBeTypeOf('number');
  });

  it('答えは蓄えさせない', async () => {
    expect((await get()).headers.get('cache-control')).toBe('no-store');
  });

  /* テストは開発中の側として走るので、ここが答えるのは `dev: true` である。**開発中のものと
     ビルドしたものは別に数える** —— 混ざると、書いたばかりのコードが画面に出ない。 */
  it('尋ねた側が読み取れる形で答える', async () => {
    const answered = await get();
    /* 答えた時点の値と比べる。**ここで測り直すと、秒がまたいだ日にだけ落ちる。** */
    const said = (await answered.clone().json()) as { uptime_s: number };
    vi.stubGlobal('fetch', async () => answered);

    expect(await probeGlasshive('http://127.0.0.1:4483', true)).toEqual({
      kind: 'observed',
      instance: {
        origin: 'http://127.0.0.1:4483',
        pid: process.pid,
        uptimeSecs: said.uptime_s,
      },
    });
  });

  it('別に数える側から尋ねられたら、居ないと答える', async () => {
    const answered = await get();
    vi.stubGlobal('fetch', async () => answered);

    expect(await probeGlasshive('http://127.0.0.1:4483', false)).toEqual({ kind: 'absent' });
  });
});
