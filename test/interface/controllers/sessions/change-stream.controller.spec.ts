import { describe, expect, it } from 'vitest';
import { observed } from '~/app-kernel/observation.ts';
import { openChangeStream } from '~/interface/controllers/sessions/change-stream.controller.ts';

/* 配る側の形は、SSE を開く `openChangeStream` 自身から引く。
   ここは `ChangeBroadcastService` を宣言した層を `import` できない。 */
type ChangeBroadcastService = Parameters<typeof openChangeStream>[0];

/** `ChangeBroadcastService` の偽物。何個のクライアントが繋がっているかを外から数えられる */
function fakeBroadcast() {
  const listeners = new Set<(m: { kind: 'tree' }) => void>();
  const service: ChangeBroadcastService = {
    subscribe(listener) {
      const l = listener as (m: { kind: 'tree' }) => void;
      listeners.add(l);
      return () => {
        listeners.delete(l);
      };
    },
    listenerCount: () => listeners.size,
    watchState: () => observed(true),
    close: () => {
      listeners.clear();
    },
  };
  const fire = () => {
    for (const l of listeners) l({ kind: 'tree' });
  };
  return { service, fire, listeners };
}

const read = async (stream: ReadableStream<Uint8Array>) => {
  const { value } = await stream.getReader().read();
  return new TextDecoder().decode(value);
};

describe('変更通知を配るコントローラー', () => {
  it('繋がったことを先に言う', async () => {
    const { service } = fakeBroadcast();
    const res = openChangeStream(service, new AbortController().signal);

    expect(res.headers.get('content-type')).toBe('text/event-stream; charset=utf-8');
    expect(res.headers.get('cache-control')).toBe('no-cache, no-transform');
    expect(await read(res.body as ReadableStream<Uint8Array>)).toBe(': connected\n\n');
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
