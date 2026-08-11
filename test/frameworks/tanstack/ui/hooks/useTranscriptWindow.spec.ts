import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/* 会話の読み取り範囲の遡り。**「もっと前」は必ず前へ進まなければならない。**

   `transcript` の 1 行は長い。ツールに渡した入力やツールが返した中身がそのまま 1 行に
   入るので、一歩ぶん(256KiB)より長い行が実際に在る。その一歩に行の頭が 1 つも無いと
   ページは空で返り、読み始めた位置を読み取り範囲の先頭として覚えると、以後そのボタンは
   同じ範囲を永久に読み直す。

   末尾の追いかけで確かめるのはもう 1 つ。**取りに行っているあいだに届いた変更通知を
   落とさない。** 落とすと、その追記が最後だったときに会話が黙って止まり、
   静かなエージェントと見分けが付かなくなる。

   観測できなかったことは、求めごとに分けて持つ。3 つの求め(初回・末尾の追いかけ・遡り)は
   互いに関係が無く、**片方の成功で、もう片方の失敗を消してはいけない。** */

const { fetchConversation, listeners } = vi.hoisted(() => ({
  fetchConversation: vi.fn(),
  listeners: new Set<(path: string) => void>(),
}));

vi.mock('~/frameworks/tanstack/queries/sessions.query.ts', () => ({ fetchConversation }));

/* 変更通知は SSE の代わりにここから流す。確かめたいのは受けた側の振る舞いで、
   `EventSource` が繋がるかは別のところの話である。 */
vi.mock('~/frameworks/tanstack/ui/hooks/useChangeStream.ts', () => ({
  subscribeToFile: (listener: (path: string) => void) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
}));

const { useTranscriptWindow } = await import(
  '~/frameworks/tanstack/ui/hooks/useTranscriptWindow.ts'
);

const FILE = '/nest/session.jsonl';
const OTHER = '/nest/other.jsonl';

/** 中身は問わない。何かが読めたことだけを言えればよい */
const event = { role: 'user' as const, ts: null, blocks: [] };

const page = (start: number, next: number, events: readonly (typeof event)[]) => ({
  ok: true,
  body: { state: 'observed', reason: null, start, next, eof: false, size: 4_000_000, events },
});

/** 観測できなかったページ。**無かったページではない** */
const unreadable = () => ({
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

/** 求めそのものが断られた答え */
const refused = () => ({
  ok: false,
  status: 503,
  body: {
    state: 'unobservable',
    code: 'transcript.unreadable',
    message: 'Could not read the transcript',
  },
});

/** 呼ばれた順に (from, to) を並べる */
const asked = () => fetchConversation.mock.calls.map(([, from, to]) => [from, to]);

/** 好きなときに答えを返せる求め */
const held = () => {
  let settle: (value: unknown) => void = () => {};
  const answer = new Promise((resolve) => {
    settle = resolve;
  });
  return { answer, settle };
};

/** 走っている求めの続きを流し切る */
const settled = async () => {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });
};

const notify = (path: string) => {
  for (const listener of listeners) listener(path);
};

beforeEach(() => {
  fetchConversation.mockReset();
  listeners.clear();
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
    fetchConversation.mockResolvedValueOnce(unreadable());

    const { result } = renderHook(() => useTranscriptWindow(FILE));

    await waitFor(() => expect(result.current.failed.initial).toBe(true));
    expect(result.current.events).toEqual([]);
  });

  /* 押しても何も足されないことを、「もう前は無い」と読ませない。 */
  it('遡る途中が観測できなかったら、観測できなかったと言う', async () => {
    fetchConversation
      .mockResolvedValueOnce(page(1_000_000, 1_000_100, [event]))
      .mockResolvedValueOnce(refused());

    const { result } = renderHook(() => useTranscriptWindow(FILE));
    await waitFor(() => expect(result.current.hasOlder).toBe(true));

    result.current.loadOlder();

    await waitFor(() => expect(result.current.failed.older).toBe(true));
    expect(result.current.events, '読めた分は消さない').toHaveLength(1);
  });

  /* 遡れなかったことを、末尾が伸びたことで打ち消さない。押した人はまだ前を読めていない。 */
  it('遡りが観測できなかったことを、末尾の追いかけの成功で消さない', async () => {
    fetchConversation
      .mockResolvedValueOnce(page(1_000_000, 1_000_100, [event]))
      .mockResolvedValueOnce(refused())
      .mockResolvedValueOnce(page(1_000_100, 1_000_200, [event]));

    const { result } = renderHook(() => useTranscriptWindow(FILE));
    await waitFor(() => expect(result.current.hasOlder).toBe(true));

    result.current.loadOlder();
    await waitFor(() => expect(result.current.failed.older).toBe(true));

    notify(FILE);

    await waitFor(() => expect(result.current.events).toHaveLength(2));
    expect(result.current.failed.older, '遡れなかったことが黙って消えている').toBe(true);
    expect(result.current.failed.follow).toBe(false);
  });
});

describe('末尾を追う', () => {
  it('変更通知が届いたら、次に読む位置から先だけを足す', async () => {
    fetchConversation
      .mockResolvedValueOnce(page(0, 100, [event]))
      .mockResolvedValueOnce(page(100, 200, [event]));

    const { result } = renderHook(() => useTranscriptWindow(FILE));
    await waitFor(() => expect(result.current.events).toHaveLength(1));

    notify(FILE);

    await waitFor(() => expect(result.current.events).toHaveLength(2));
    expect(asked()).toEqual([
      [null, null],
      [100, null],
    ]);
  });

  it('取りに行っているあいだに届いた変更通知を落とさない', async () => {
    const first = held();
    fetchConversation
      .mockResolvedValueOnce(page(0, 100, [event]))
      .mockReturnValueOnce(first.answer)
      .mockResolvedValueOnce(page(200, 300, [event]));

    const { result } = renderHook(() => useTranscriptWindow(FILE));
    await waitFor(() => expect(result.current.events).toHaveLength(1));

    notify(FILE);
    await waitFor(() => expect(fetchConversation).toHaveBeenCalledTimes(2));
    // 1 回目がまだ返ってきていないあいだに、次の追記が届く
    notify(FILE);
    first.settle(page(100, 200, [event]));

    await waitFor(() => expect(result.current.events).toHaveLength(3));
    expect(asked().slice(1), '取っているあいだの変更通知が落ちている').toEqual([
      [100, null],
      [200, null],
    ]);
  });

  it('遡っているあいだに届いた変更通知も落とさない', async () => {
    const older = held();
    fetchConversation
      .mockResolvedValueOnce(page(1_000_000, 1_000_100, [event]))
      .mockReturnValueOnce(older.answer)
      .mockResolvedValueOnce(page(1_000_100, 1_000_200, [event]));

    const { result } = renderHook(() => useTranscriptWindow(FILE));
    await waitFor(() => expect(result.current.hasOlder).toBe(true));

    result.current.loadOlder();
    await waitFor(() => expect(fetchConversation).toHaveBeenCalledTimes(2));
    notify(FILE);
    older.settle(page(800_000, 900_000, [event]));

    await waitFor(() => expect(fetchConversation).toHaveBeenCalledTimes(3));
    expect(asked()[2], '遡っているあいだの変更通知が落ちている').toEqual([1_000_100, null]);
  });

  it('追いかけが観測できなかったら、観測できなかったと言う', async () => {
    fetchConversation
      .mockResolvedValueOnce(page(0, 100, [event]))
      .mockResolvedValueOnce(unreadable());

    const { result } = renderHook(() => useTranscriptWindow(FILE));
    await waitFor(() => expect(result.current.events).toHaveLength(1));

    notify(FILE);

    await waitFor(() => expect(result.current.failed.follow).toBe(true));
    expect(result.current.events, '読めた分は消さない').toHaveLength(1);
  });

  /* 末尾が返らなくなったことを、遡れたことで打ち消さない。会話はまだ止まったままである。 */
  it('追いかけが観測できなかったことを、遡りの成功で消さない', async () => {
    fetchConversation
      .mockResolvedValueOnce(page(1_000_000, 1_000_100, [event]))
      .mockResolvedValueOnce(unreadable())
      .mockResolvedValueOnce(page(800_000, 900_000, [event]));

    const { result } = renderHook(() => useTranscriptWindow(FILE));
    await waitFor(() => expect(result.current.hasOlder).toBe(true));

    notify(FILE);
    await waitFor(() => expect(result.current.failed.follow).toBe(true));

    result.current.loadOlder();

    await waitFor(() => expect(result.current.events).toHaveLength(2));
    expect(result.current.failed.follow, '末尾が返らないことが黙って消えている').toBe(true);
    expect(result.current.failed.older).toBe(false);
  });

  it('もう一度読めたら、観測できなかったとは言わない', async () => {
    fetchConversation
      .mockResolvedValueOnce(page(0, 100, [event]))
      .mockResolvedValueOnce(unreadable())
      .mockResolvedValueOnce(page(100, 200, [event]));

    const { result } = renderHook(() => useTranscriptWindow(FILE));
    await waitFor(() => expect(result.current.events).toHaveLength(1));

    notify(FILE);
    await waitFor(() => expect(result.current.failed.follow).toBe(true));
    notify(FILE);

    await waitFor(() => expect(result.current.failed.follow).toBe(false));
    expect(asked().slice(1), '返ってこなかった位置から読み直していない').toEqual([
      [100, null],
      [100, null],
    ]);
  });
});

describe('別の `transcript` へ移る', () => {
  it('前の読み取り範囲の先頭を持ち越さない', async () => {
    fetchConversation
      .mockResolvedValueOnce(page(1_000_000, 1_000_100, [event]))
      .mockResolvedValueOnce(unreadable());

    const { result, rerender } = renderHook(({ file }) => useTranscriptWindow(file), {
      initialProps: { file: FILE },
    });
    await waitFor(() => expect(result.current.hasOlder).toBe(true));

    rerender({ file: OTHER });

    await waitFor(() => expect(result.current.failed.initial).toBe(true));
    expect(result.current.hasOlder, '前の `transcript` のバイトの位置が残っている').toBe(false);
  });

  it('遡っている途中で移ったら、前のファイルのページを混ぜない', async () => {
    const older = held();
    fetchConversation
      .mockResolvedValueOnce(page(1_000_000, 1_000_100, [event]))
      .mockReturnValueOnce(older.answer)
      // 移った先の会話。混ざったかどうかが読めるように、件数を分けておく
      .mockResolvedValueOnce(page(0, 50, [event, event]));

    const { result, rerender } = renderHook(({ file }) => useTranscriptWindow(file), {
      initialProps: { file: FILE },
    });
    await waitFor(() => expect(result.current.hasOlder).toBe(true));

    result.current.loadOlder();
    await waitFor(() => expect(fetchConversation).toHaveBeenCalledTimes(2));
    rerender({ file: OTHER });
    await waitFor(() => expect(result.current.events).toHaveLength(2));

    older.settle(page(500_000, 600_000, [event]));
    await settled();

    expect(result.current.events, '前のファイルのイベントが混ざっている').toHaveLength(2);
    expect(result.current.hasOlder, '前のファイルの位置が読み取り範囲の先頭になっている').toBe(
      false,
    );
  });
});
