import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/* 変更通知が届く条件は 2 つある。**どちらが欠けても更新は来ない。**

   SSE が開いていること、そしてサーバーがウォッチャーを張れていること。片方だけを画面へ
   渡すと、繋がってさえいれば健全に見えてしまい、ユーザーは止まった画面を「何も起きて
   いない」と読む。 */

vi.mock('~/frameworks/tanstack/queries/tree.query.ts', () => ({ treeQueryKey: ['tree'] }));

const { useChangeStream, subscribeToFile } = await import(
  '~/frameworks/tanstack/ui/hooks/useChangeStream.ts'
);

/** `EventSource` の偽物。サーバーから来たことにできる */
class FakeEventSource {
  static readonly opened: FakeEventSource[] = [];
  onopen: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  closed = false;

  constructor(readonly url: string) {
    FakeEventSource.opened.push(this);
  }

  close() {
    this.closed = true;
  }
}

const original = globalThis.EventSource;

beforeEach(() => {
  FakeEventSource.opened.length = 0;
  globalThis.EventSource = FakeEventSource as unknown as typeof EventSource;
});

afterEach(() => {
  globalThis.EventSource = original;
});

function mount() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  const rendered = renderHook(() => useChangeStream(), { wrapper });
  const source = FakeEventSource.opened[0];
  if (source === undefined) throw new Error('SSE を開くはずだった');
  return { ...rendered, source };
}

/** サーバーから 1 通届いたことにする */
const deliver = (source: FakeEventSource, message: unknown) =>
  act(() => source.onmessage?.({ data: JSON.stringify(message) }));

describe('変更通知の届き方', () => {
  it('繋がるまでは、繋がっていないと言う', () => {
    const { result, source } = mount();

    expect(source.url).toBe('/api/stream');
    expect(result.current.connected).toBe(false);
    expect(result.current.watching, 'サーバーが何か言うまでは張れているものとして扱う').toBe(true);

    act(() => source.onopen?.());

    expect(result.current.connected).toBe(true);
  });

  it('ウォッチャーを張れていないことは、繋がっていることと分けて出す', () => {
    const { result, source } = mount();
    act(() => source.onopen?.());

    deliver(source, { kind: 'watch', watching: false });

    expect(result.current.connected, 'SSE 自体は開いたままである').toBe(true);
    expect(result.current.watching, '更新が届かないことは隠さない').toBe(false);
  });

  it('張れていると言われたら、そのまま張れていると言う', () => {
    const { result, source } = mount();

    deliver(source, { kind: 'watch', watching: false });
    deliver(source, { kind: 'watch', watching: true });

    expect(result.current.watching).toBe(true);
  });

  it('`watching` の付いていない変更通知では、張れているかを動かさない', () => {
    const { result, source } = mount();

    deliver(source, { kind: 'watch' });
    deliver(source, { kind: 'tree' });

    expect(result.current.watching).toBe(true);
  });

  it('切れたことは伝えるが、`EventSource` は閉じない', () => {
    const { result, source } = mount();
    act(() => source.onopen?.());

    act(() => source.onerror?.());

    expect(result.current.connected).toBe(false);
    expect(source.closed, 'ここで閉じると二度と繋ぎ直らない').toBe(false);
  });

  it('`transcript` 1 つの変更通知は、会話のパネルへ配る', () => {
    const { source } = mount();
    const got: string[] = [];
    const stop = subscribeToFile((path) => got.push(path));

    deliver(source, { kind: 'file', path: '/nest/session.jsonl' });
    stop();
    deliver(source, { kind: 'file', path: '/nest/other.jsonl' });

    expect(got).toEqual(['/nest/session.jsonl']);
  });

  it('読めない変更通知は捨てて、次を待つ', () => {
    const { result, source } = mount();
    act(() => source.onopen?.());

    act(() => source.onmessage?.({ data: 'これは JSON ではない' }));

    expect(result.current.connected).toBe(true);
  });
});
