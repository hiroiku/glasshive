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

/** `size` を渡せるようにしてあるのは、読んでいるあいだに `transcript` が伸びるときのためである */
const page = (
  start: number,
  next: number,
  events: readonly (typeof event)[],
  size = 4_000_000,
) => ({
  ok: true,
  body: { state: 'observed', reason: null, start, next, eof: false, size, events },
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

/** 好きなときに答えを返すか、投げさせられる求め */
const held = () => {
  let settle: (value: unknown) => void = () => {};
  let fail: (error: unknown) => void = () => {};
  const answer = new Promise((resolve, reject) => {
    settle = resolve;
    fail = reject;
  });
  return { answer, settle, fail };
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

/* 末尾を追っているあいだの「もっと前」。**押されたことを落とさない。**

   このフックの中は 1 つの求めしか通さない —— 重なるとページが互い違いに入り、バイトの計算が
   合わなくなる。それは正しいが、塞がっているあいだの押しを黙って捨てると、押しても何も
   起きないボタンが「もう前は無い」と見分けの付かない形で残る。しかも塞がっている時間が
   いちばん長いのは、いま誰かが動かしている `transcript` —— 押したくなるのはまさにそこである。 */
describe('末尾を追っているあいだに、もっと前を押す', () => {
  /** 末尾を追わせたまま止めておく。追いかけが返るまで、このフックは塞がったままである */
  const following = async () => {
    const tail = held();
    fetchConversation
      .mockResolvedValueOnce(page(1_000_000, 1_000_100, [event]))
      .mockReturnValueOnce(tail.answer)
      .mockResolvedValue(page(800_000, 900_000, [event]));

    const { result, rerender } = renderHook(({ file }) => useTranscriptWindow(file), {
      initialProps: { file: FILE },
    });
    await waitFor(() => expect(result.current.events).toHaveLength(1));
    await act(async () => {
      notify(FILE);
    });
    return { result, rerender, tail };
  };

  it('押しは落とさず、追い終えてから効く', async () => {
    const { result, tail } = await following();

    act(() => {
      result.current.loadOlder();
    });

    expect(asked().length, '塞がっているあいだの押しで取りに行くと、ページが互い違いに入る').toBe(
      2,
    );

    await act(async () => {
      tail.settle(page(1_000_100, 1_000_200, [event]));
      await tail.answer;
    });
    await waitFor(() => expect(result.current.events).toHaveLength(3));

    expect(asked().at(-1), '押されたことを落とすと、押しても何も起きないボタンが残る').toEqual([
      737_856, 1_000_000,
    ]);
  });

  /* 効くのが一拍後でも、押した人から見て何も変わらない間が在ってはいけない。
   **待ちは押した時点で出す** —— そこが空白だと、押せていないのと同じ絵になる。 */
  it('待ちは、押した時点で出る', async () => {
    const { result, tail } = await following();

    act(() => {
      result.current.loadOlder();
    });

    expect(
      result.current.reading.older,
      '押した瞬間に何も変わらないと、押せなかったのと同じ絵になる',
    ).toBe(true);

    await act(async () => {
      tail.settle(page(1_000_100, 1_000_200, [event]));
      await tail.answer;
    });
    await waitFor(() => expect(result.current.reading.older).toBe(false));
  });

  /* 覚えた押しは、その `transcript` のものである。**開き直したら捨てる** —— 持ち越すと、
     開いた別の会話が、押してもいないのに勝手に遡り始める。 */
  it('別の `transcript` へ移ったら、覚えた押しは捨てる', async () => {
    const { result, rerender, tail } = await following();

    act(() => {
      result.current.loadOlder();
    });
    /* 移った先も途中から読み始める。**`windowStart` が 0 の会話に移らない** —— 0 だと
       遡るものが無く、持ち越した押しがそこで止まって、持ち越したかどうかが見えない。 */
    fetchConversation.mockResolvedValue(page(500_000, 500_100, [event, event]));
    rerender({ file: OTHER });
    await waitFor(() => expect(result.current.events).toHaveLength(2));
    expect(result.current.hasOlder, '遡るものが無いと、この回は何も確かめていない').toBe(true);

    const before = fetchConversation.mock.calls.length;
    await act(async () => {
      tail.settle(page(1_000_100, 1_000_200, [event]));
      await tail.answer;
    });
    await settled();

    expect(
      fetchConversation.mock.calls.length,
      '前の `transcript` で押されたことを持ち越すと、開いた会話が押されてもいないのに遡る',
    ).toBe(before);
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

/* 求めそのものが例外で終わることも在る。`getConversation` はサーバーへの往復なので、
   繋がりが切れれば `Promise` は答えではなく例外で終わる。**受けそこねると、読んでいる最中の
   表示がそのまま残る** —— 読めなかったことが、いつまでも読んでいる最中として画面に出る。 */
describe('求めが例外で終わる', () => {
  it('開いたときの求めが投げたら、読み終えたうえで読めなかったと言う', async () => {
    fetchConversation.mockRejectedValueOnce(new Error('offline'));

    const { result } = renderHook(() => useTranscriptWindow(FILE));

    await waitFor(() => expect(result.current.failed.initial).toBe(true));
    expect(result.current.reading.initial, '待ちが残ると、読めなかったことが画面から消える').toBe(
      false,
    );
  });

  it('遡りの求めが投げたら、「もう前は無い」ではなく読めなかったと言う', async () => {
    fetchConversation
      .mockResolvedValueOnce(page(1_000_000, 1_000_100, [event]))
      .mockRejectedValueOnce(new Error('offline'));

    const { result } = renderHook(() => useTranscriptWindow(FILE));
    await waitFor(() => expect(result.current.hasOlder).toBe(true));

    result.current.loadOlder();

    await waitFor(() => expect(result.current.failed.older).toBe(true));
    expect(result.current.reading.older).toBe(false);
  });

  it('追いかけの求めが投げたら、末尾が返らなかったと言う', async () => {
    fetchConversation
      .mockResolvedValueOnce(page(0, 100, [event]))
      .mockRejectedValueOnce(new Error('offline'));

    const { result } = renderHook(() => useTranscriptWindow(FILE));
    await waitFor(() => expect(result.current.events).toHaveLength(1));

    notify(FILE);

    await waitFor(() => expect(result.current.failed.follow).toBe(true));
    expect(result.current.events, '読めた分は消さない').toHaveLength(1);
  });

  /* 投げるのは、開き直した後のことが在る。**前のファイルの失敗を、いま開いている会話の
     ものとして出さない** —— 尋ねてすらいない末尾について「返ってこなかった」と言うのは、
     観測していないものを観測できなかったことにするのと同じである。 */
  it('別の `transcript` へ移った後に投げた求めを、いまの会話の失敗にしない', async () => {
    const following = held();
    fetchConversation
      .mockResolvedValueOnce(page(0, 100, [event]))
      .mockReturnValueOnce(following.answer)
      .mockResolvedValueOnce(page(0, 50, [event]));

    const { result, rerender } = renderHook(({ file }) => useTranscriptWindow(file), {
      initialProps: { file: FILE },
    });
    await waitFor(() => expect(result.current.events).toHaveLength(1));

    notify(FILE);
    await waitFor(() => expect(fetchConversation).toHaveBeenCalledTimes(2));

    rerender({ file: OTHER });
    following.fail(new Error('offline'));
    await settled();

    expect(
      result.current.failed.follow,
      '尋ねていない末尾について、返ってこなかったと言っている',
    ).toBe(false);
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

/* 読んでいる最中であることは、読めなかったことや、何も話されていないことと別である。

   **末尾の追いかけだけは待ちの表示を出さない。** 追っているのは既に画面に出ている会話の続きで、
   そこに出すと、変更通知が届くたびに読めている会話の上へ待ちの表示が出る。 */
describe('読んでいる最中', () => {
  it('開いてから最初のページが返るまで、読んでいると言う', async () => {
    const first = held();
    fetchConversation.mockReturnValueOnce(first.answer);

    const { result } = renderHook(() => useTranscriptWindow(FILE));

    await waitFor(() => expect(result.current.reading.initial).toBe(true));
    expect(result.current.events, 'まだ 1 行も出ていない').toHaveLength(0);

    first.settle(page(1_000_000, 1_000_100, [event]));
    await waitFor(() => expect(result.current.events).toHaveLength(1));
    expect(result.current.reading.initial).toBe(false);
  });

  /* 観測できなかったときも待ちは畳む。**畳まないと、読めなかった画面が読み込み中の顔で残る。** */
  it('最初のページが読めなくても、読んでいる最中ではなくなる', async () => {
    fetchConversation.mockResolvedValueOnce(refused());

    const { result } = renderHook(() => useTranscriptWindow(FILE));

    await waitFor(() => expect(result.current.failed.initial).toBe(true));
    expect(result.current.reading.initial).toBe(false);
  });

  it('「もっと前」を押しているあいだ、遡っていると言う', async () => {
    const older = held();
    fetchConversation
      .mockResolvedValueOnce(page(1_000_000, 1_000_100, [event]))
      .mockReturnValueOnce(older.answer);

    const { result } = renderHook(() => useTranscriptWindow(FILE));
    await waitFor(() => expect(result.current.hasOlder).toBe(true));

    act(() => result.current.loadOlder());
    await waitFor(() => expect(result.current.reading.older).toBe(true));

    older.settle(page(500_000, 600_000, [event]));
    await waitFor(() => expect(result.current.reading.older).toBe(false));
  });

  it('末尾の追いかけでは、読んでいると言わない', async () => {
    const follow = held();
    fetchConversation
      .mockResolvedValueOnce(page(1_000_000, 1_000_100, [event]))
      .mockReturnValueOnce(follow.answer);

    const { result } = renderHook(() => useTranscriptWindow(FILE));
    await waitFor(() => expect(result.current.events).toHaveLength(1));

    act(() => notify(FILE));
    await settled();

    expect(
      result.current.reading,
      '既に画面に出ている会話の上に待ちの表示を出すと、読めているものが読めていないように見える',
    ).toEqual({ initial: false, older: false });

    follow.settle(page(1_000_100, 1_000_200, [event]));
    await settled();
  });
});

/* 手元に在る範囲。**分母は読めたページが持ってくる** —— 大きさを観測する前に割合を出すと、
   分母の無い数が割合の顔で画面に出る。 */
describe('手元に在るバイトの範囲', () => {
  it('1 ページも読めていないうちは、何も言わない', async () => {
    const first = held();
    fetchConversation.mockReturnValueOnce(first.answer);

    const { result } = renderHook(() => useTranscriptWindow(FILE));

    await waitFor(() => expect(result.current.reading.initial).toBe(true));
    expect(result.current.held, '大きさを観測していないうちは分母が無い').toBeNull();

    first.settle(page(1_000_000, 1_000_100, [event]));
    await waitFor(() => expect(result.current.held).not.toBeNull());
  });

  it('読み取り範囲の先頭から読み切れたところまでを、大きさとともに持つ', async () => {
    fetchConversation.mockResolvedValueOnce(page(1_000_000, 1_000_100, [event]));

    const { result } = renderHook(() => useTranscriptWindow(FILE));

    await waitFor(() => expect(result.current.held).toEqual({ bytes: 100, size: 4_000_000 }));
  });

  it('遡ったぶんだけ、手元に在る範囲が広がる', async () => {
    /* 「もっと前」が 1 歩で遡る量。読み取り範囲の先頭は、**頼んだ位置**へ動く ——
       読み始めた位置ではないことは、この上の describe が確かめている。 */
    const STEP = 256 * 1024;
    fetchConversation
      .mockResolvedValueOnce(page(1_000_000, 1_000_100, [event]))
      .mockResolvedValueOnce(page(900_000, 1_000_000, [event]));

    const { result } = renderHook(() => useTranscriptWindow(FILE));
    await waitFor(() => expect(result.current.hasOlder).toBe(true));

    act(() => result.current.loadOlder());

    await waitFor(() =>
      expect(result.current.held?.bytes, '手元に在る範囲は、遡ったぶんだけ前へ伸びる').toBe(
        1_000_100 - (1_000_000 - STEP),
      ),
    );
  });

  /* 分母は読んでいるあいだにも動く。エージェントが話し続けている `transcript` は追記され
     続けるので、開いたときの大きさのままにすると、読めた量がそれを追い越して割合が
     100% を超える。 */
  it('末尾を追いかけたら、大きさも読み直す', async () => {
    fetchConversation
      .mockResolvedValueOnce(page(1_000_000, 1_000_100, [event]))
      .mockResolvedValueOnce(page(1_000_100, 1_000_200, [event], 5_000_000));

    const { result } = renderHook(() => useTranscriptWindow(FILE));
    await waitFor(() => expect(result.current.held).not.toBeNull());

    act(() => notify(FILE));

    await waitFor(() =>
      expect(result.current.held, '伸びた `transcript` を、開いたときの大きさで割る').toEqual({
        bytes: 200,
        size: 5_000_000,
      }),
    );
  });

  it('別の `transcript` を開いたら、前の大きさを持ち越さない', async () => {
    const second = held();
    fetchConversation
      .mockResolvedValueOnce(page(1_000_000, 1_000_100, [event]))
      .mockReturnValueOnce(second.answer);

    const { result, rerender } = renderHook(({ file }) => useTranscriptWindow(file), {
      initialProps: { file: FILE },
    });
    await waitFor(() => expect(result.current.held).not.toBeNull());

    rerender({ file: OTHER });

    expect(result.current.held, '前のファイルの大きさを分母にした割合が出る').toBeNull();
    second.settle(page(0, 50, [event]));
    await settled();
  });
});
