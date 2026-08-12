import { afterEach, describe, expect, it, vi } from 'vitest';
import { COMMAND_HEADER, COMMAND_HEADER_VALUE } from '~/frameworks/node/cli-request.ts';

/* 走っている glasshive を終わらせるルート。

   **ブラウザーからは終わらせられない。** 開いているページが、観ている当のサーバーを落とせて
   は困る。断りはこのファイルが自分で持っているので、ここを確かめないと、`if` を丸ごと消して
   も何も落ちない。

   終わらせる側も確かめる。答えを書き終える前に終わると、伝えに来たコマンドは接続を切られた
   側として「止まったかどうか分からない」を受け取る。 */

const { Route } = await import('~/frameworks/tanstack/routes/api.quit.ts');

interface Handlers {
  readonly POST: (context: { request: Request }) => Response | Promise<Response>;
}

/* 組み上がったルートのハンドラーをそのまま呼ぶ。写しを作ると、写しのほうを確かめてしまう。

   ルーターが組んだ引数の型はここでは全部は作れない。**ハンドラーが実際に読むのは
   `request` だけ**なので、そこだけを渡す。 */
const post = async (headers: Record<string, string>): Promise<Response> => {
  const { handlers } = (Route.options as unknown as { server: { handlers: Handlers } }).server;
  return await handlers.POST({
    request: new Request('http://127.0.0.1:4483/api/quit', { method: 'POST', headers }),
  });
};

/** コマンドラインが付けるヘッダー。`origin` は付かない */
const fromCommandLine = { [COMMAND_HEADER]: COMMAND_HEADER_VALUE };

/* 本当に終わらせるルートなので、`process.exit` は必ず捕まえる。**捕まえ損ねると、テストを
   走らせている node がそこで消える。** */
const catchExit = () => vi.spyOn(process, 'exit').mockImplementation((() => undefined) as never);

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('走っている glasshive を終わらせる', () => {
  it('コマンドラインからの求めなら、答えを返してから終わる', async () => {
    vi.useFakeTimers();
    const exit = catchExit();

    const response = await post(fromCommandLine);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ pid: process.pid });
    expect(exit, '答えを書き終える前に終わらない').not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(50);
    expect(exit).toHaveBeenCalledWith(0);
  });

  /* `npm run dev` が相手だと preflight が通り、`x-glasshive-command` を付けた POST が実際に
     届く。そこで断っているのは `origin` の側だけである。 */
  it('ブラウザーからは終わらせられない', async () => {
    vi.useFakeTimers();
    const exit = catchExit();

    const response = await post({ ...fromCommandLine, origin: 'http://127.0.0.1:4483' });

    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({
      state: 'invalid',
      code: 'workspace.not_command_line',
    });

    await vi.advanceTimersByTimeAsync(1000);
    expect(exit, '断ったのに終わってはいけない').not.toHaveBeenCalled();
  });

  it('ヘッダーが無ければ断る', async () => {
    vi.useFakeTimers();
    const exit = catchExit();

    const response = await post({});

    expect(response.status).toBe(403);
    await vi.advanceTimersByTimeAsync(1000);
    expect(exit).not.toHaveBeenCalled();
  });

  it('ヘッダーの中身が違えば断る', async () => {
    vi.useFakeTimers();
    const exit = catchExit();

    const response = await post({ [COMMAND_HEADER]: 'yes' });

    expect(response.status).toBe(403);
    await vi.advanceTimersByTimeAsync(1000);
    expect(exit).not.toHaveBeenCalled();
  });

  it('答えは蓄えさせない', async () => {
    vi.useFakeTimers();
    catchExit();

    const response = await post(fromCommandLine);

    expect(response.headers.get('cache-control')).toBe('no-store');
  });
});
