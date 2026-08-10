import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/* 会話の読み取り範囲の遡り。**「もっと前」は必ず前へ進まなければならない。**

   `transcript` の 1 行は長い。ツールに渡した入力やツールが返した中身がそのまま 1 行に
   入るので、一歩ぶん(256KiB)より長い行が実際に在る。その一歩に行の頭が 1 つも無いと
   ページは空で返り、読み始めた位置を読み取り範囲の先頭として覚えると、以後そのボタンは
   同じ範囲を永久に読み直す。 */

const { fetchConversation } = vi.hoisted(() => ({ fetchConversation: vi.fn() }));

vi.mock('~/frameworks/tanstack/queries/sessions.query.ts', () => ({ fetchConversation }));
vi.mock('~/frameworks/tanstack/queries/tree.query.ts', () => ({ treeQueryKey: ['tree'] }));

const { useTranscriptWindow } = await import(
  '~/frameworks/tanstack/ui/hooks/useTranscriptWindow.ts'
);

const FILE = '/nest/session.jsonl';

/** 中身は問わない。何かが読めたことだけを言えればよい */
const event = { role: 'user' as const, ts: null, blocks: [] };

const page = (start: number, next: number, events: readonly (typeof event)[]) => ({
  ok: true,
  body: { state: 'observed', reason: null, start, next, eof: false, size: 4_000_000, events },
});

/** 呼ばれた順に (from, to) を並べる */
const asked = () => fetchConversation.mock.calls.map(([, from, to]) => [from, to]);

beforeEach(() => {
  fetchConversation.mockReset();
});

describe('もっと前を読む', () => {
  it('一歩で何も読めなくても、次の一歩へ進む', async () => {
    fetchConversation
      // 末尾の読み取り範囲
      .mockResolvedValueOnce(page(1_000_000, 1_000_100, [event]))
      // 一歩目。範囲がまるごと 1 行の中に入り、行の頭が 1 つも無い
      .mockResolvedValueOnce(page(1_000_000, 1_000_000, []))
      // 二歩目でようやく行の頭に当たる
      .mockResolvedValueOnce(page(500_000, 737_856, [event]));

    const { result } = renderHook(() => useTranscriptWindow(FILE));
    await waitFor(() => expect(result.current.events).toHaveLength(1));

    result.current.loadOlder();

    await waitFor(() => expect(result.current.events).toHaveLength(2));
    expect(asked().slice(1), '同じ範囲を読み直している').toEqual([
      [737_856, 1_000_000],
      [475_712, 737_856],
    ]);
  });

  it('二度押しても、同じ範囲を読み直さない', async () => {
    fetchConversation
      .mockResolvedValueOnce(page(1_000_000, 1_000_100, [event]))
      .mockResolvedValue(page(800_000, 900_000, [event]));

    const { result } = renderHook(() => useTranscriptWindow(FILE));
    await waitFor(() => expect(result.current.events).toHaveLength(1));

    result.current.loadOlder();
    await waitFor(() => expect(result.current.events).toHaveLength(2));
    result.current.loadOlder();
    await waitFor(() => expect(result.current.events).toHaveLength(3));

    expect(asked().slice(1)).toEqual([
      [737_856, 1_000_000],
      [475_712, 737_856],
    ]);
  });

  it('先頭まで戻ったら、もう前は無いと言う', async () => {
    fetchConversation
      .mockResolvedValueOnce(page(200_000, 200_100, [event]))
      .mockResolvedValueOnce(page(0, 200_000, [event]));

    const { result } = renderHook(() => useTranscriptWindow(FILE));
    await waitFor(() => expect(result.current.hasOlder).toBe(true));

    result.current.loadOlder();

    await waitFor(() => expect(result.current.hasOlder).toBe(false));
    expect(asked().slice(1)).toEqual([[0, 200_000]]);
  });

  /* 観測できなかったことを、空の会話で表さない。 */
  it('観測できなかったら、観測できなかったと言う', async () => {
    fetchConversation.mockResolvedValueOnce({
      ok: true,
      body: {
        state: 'unobservable',
        reason: 'transcript.read_failed',
        start: 0,
        next: 0,
        eof: true,
        size: 0,
        events: [],
      },
    });

    const { result } = renderHook(() => useTranscriptWindow(FILE));

    await waitFor(() => expect(result.current.failed).toBe(true));
    expect(result.current.events).toEqual([]);
  });
});
