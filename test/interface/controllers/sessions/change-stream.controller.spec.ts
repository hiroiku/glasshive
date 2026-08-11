import { describe, expect, it } from 'vitest';
import { AppError } from '~/app-kernel/error.ts';
import { type Observation, observed, unobservable } from '~/app-kernel/observation.ts';
import { openChangeStream } from '~/interface/controllers/sessions/change-stream.controller.ts';

/* 配る側の形は、SSE を開く `openChangeStream` 自身から引く。
   ここは `ChangeBroadcastService` を宣言した層を `import` できない。 */
type ChangeBroadcastService = Parameters<typeof openChangeStream>[0];
type ChangeMessage = Parameters<Parameters<ChangeBroadcastService['subscribe']>[0]>[0];

class TestError extends AppError {
  readonly code = 'test.watch_failed';
}

/** `ChangeBroadcastService` の偽物。何個のクライアントが繋がっているかを外から数えられる */
function fakeBroadcast(state: Observation<true> = observed(true)) {
  const listeners = new Set<(m: ChangeMessage) => void>();
  const service: ChangeBroadcastService = {
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    listenerCount: () => listeners.size,
    watchState: () => state,
    close: () => {
      listeners.clear();
    },
  };
  const fire = (message: ChangeMessage) => {
    for (const l of listeners) l(message);
  };
  return { service, fire, listeners };
}

const read = async (stream: ReadableStream<Uint8Array>) => {
  const { value } = await stream.getReader().read();
  return new TextDecoder().decode(value);
};

/** 先頭から `count` 個ぶん読む。1 度に 1 つずつ流れるので、順番もこれで見える */
async function readAll(stream: ReadableStream<Uint8Array>, count: number): Promise<string[]> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  const chunks: string[] = [];
  for (let i = 0; i < count; i++) {
    const { value, done } = await reader.read();
    if (done) break;
    chunks.push(decoder.decode(value));
  }
  return chunks;
}

describe('変更通知を配るコントローラー', () => {
  it('繋がったことを先に言う', async () => {
    const { service } = fakeBroadcast();
    const res = openChangeStream(service, new AbortController().signal);

    expect(res.headers.get('content-type')).toBe('text/event-stream; charset=utf-8');
    expect(res.headers.get('cache-control')).toBe('no-cache, no-transform');
    expect(await read(res.body as ReadableStream<Uint8Array>)).toBe(': connected\n\n');
  });

  /* 繋がったことと更新が届くことは別である。ウォッチャーが張れていない機械では、
     この接続は開いたまま何も運ばない。 */
  it('ウォッチャーを張れているかを、繋いだ直後に言う', async () => {
    const { service } = fakeBroadcast(observed(true));

    const res = openChangeStream(service, new AbortController().signal);

    expect(await readAll(res.body as ReadableStream<Uint8Array>, 2)).toEqual([
      ': connected\n\n',
      'data: {"kind":"watch","watching":true}\n\n',
    ]);
  });

  it('張れていなければ、繋いだ直後にそう言う', async () => {
    const { service } = fakeBroadcast(unobservable(new TestError('張れませんでした')));

    const res = openChangeStream(service, new AbortController().signal);

    expect(await readAll(res.body as ReadableStream<Uint8Array>, 2)).toEqual([
      ': connected\n\n',
      'data: {"kind":"watch","watching":false}\n\n',
    ]);
  });

  it('張った後に死んだことも、繋いだままのクライアントへ流す', async () => {
    const { service, fire } = fakeBroadcast();
    const res = openChangeStream(service, new AbortController().signal);
    const body = res.body as ReadableStream<Uint8Array>;
    const reader = body.getReader();

    // 読み始めるまで start は走らない
    await reader.read();
    await reader.read();

    fire({ kind: 'watch', watching: false });

    const { value } = await reader.read();
    expect(new TextDecoder().decode(value)).toBe('data: {"kind":"watch","watching":false}\n\n');
  });

  it('クライアントが切断したら、リスナーを外す', async () => {
    const { service } = fakeBroadcast();
    const aborter = new AbortController();
    const res = openChangeStream(service, aborter.signal);

    // 読み始めるまで start は走らない
    await read(res.body as ReadableStream<Uint8Array>);
    expect(service.listenerCount(), '繋がっているあいだは 1 つ').toBe(1);

    aborter.abort();

    expect(
      service.listenerCount(),
      '切断した後は 0 に戻る — ここが漏れるとクライアントの数だけ溜まる',
    ).toBe(0);
  });

  it('既に切断した後に開かれても、リスナーを残さない', async () => {
    const { service } = fakeBroadcast();
    const aborter = new AbortController();
    aborter.abort();

    const res = openChangeStream(service, aborter.signal);
    await read(res.body as ReadableStream<Uint8Array>);

    expect(service.listenerCount()).toBe(0);
  });
});
