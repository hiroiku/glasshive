import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { useTabSelection } from '~/frameworks/tanstack/ui/hooks/useTabSelection.ts';

/* 画面がサーバーとやり取りするところ。**ここが観測の最後の一歩である。**

   途中の層がどれだけ「無かった」と「観測できなかった」を分けて運んでも、
   最後に画面が両方を同じ見た目へ倒せば、ユーザーにとっては潰れているのと変わらない。 */

const server = vi.hoisted(() => ({
  get: vi.fn(),
  set: vi.fn(),
}));

vi.mock('~/frameworks/tanstack/functions/preferences.ts', () => ({
  getPreferences: () => server.get(),
  setPreferences: (args: unknown) => server.set(args),
}));

/** サーバーが返す形は、画面が受け取る形から取る。型を書き写すと、形が変わっても気づけない */
type Handle = ReturnType<typeof useTabSelection>;
type StoredState = Handle['storedState'];

interface PreferencesBody {
  watched: string[];
  visible_tabs: string[];
  stored: { state: StoredState; reason: string | null };
}

/* 記録は絶対パスで、タブに並ぶのは id である。**画面はその読み替えを知らない** ——
   知らないままでよいことを、ここでも同じ形で確かめる。 */
const body = (tabs: string[], stored: PreferencesBody['stored']): PreferencesBody => ({
  watched: tabs.map((id) => `/w/${id}`),
  visible_tabs: tabs,
  stored,
});

function mount() {
  /* 取り直しはしない。落ちたことをそのまま見たいので、隠れた再試行を挟ませない */
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return renderHook(() => useTabSelection(), { wrapper });
}

describe('`preferences.json` をどう読めたかを、画面まで落とさずに運ぶ', () => {
  it('読めた日は、読めたと言う', async () => {
    server.get.mockResolvedValue(body(['-w-a'], { state: 'observed', reason: null }));

    const { result } = mount();

    await waitFor(() => expect(result.current.storedState).toBe('observed'));
    expect(result.current.watched).toEqual(new Set(['-w-a']));
  });

  it('まだ `preferences.json` が無い日は、無いと言う', async () => {
    server.get.mockResolvedValue(body([], { state: 'absent', reason: 'no-source' }));

    const { result } = mount();

    await waitFor(() => expect(result.current.storedState).toBe('absent'));
  });

  it('サーバーが観測できなかった日は、そのまま観測できなかったと言う', async () => {
    server.get.mockResolvedValue(
      body([], { state: 'unobservable', reason: 'preferences.unreadable' }),
    );

    const { result } = mount();

    await waitFor(() => expect(result.current.storedState).toBe('unobservable'));
  });

  it('取りに行って落ちた日は、「1 つも観ていない」と言わない', async () => {
    server.get.mockRejectedValue(new Error('つながらない'));

    const { result } = mount();

    await waitFor(() =>
      expect(
        result.current.storedState,
        '結果を一度も受け取れていないのを absent と言うと、記録が黙って消えたようにしか見えない',
      ).toBe('unobservable'),
    );
    expect(result.current.watched, '記録は分からないので、空で描くほかない').toEqual(new Set());
  });

  it('まだ届いていない間は、何も言わない', () => {
    // 届く前から「読めなかった」と言うと、開くたびに断りが一瞬出る
    server.get.mockReturnValue(new Promise(() => {}));

    const { result } = mount();

    expect(result.current.storedState).toBe('absent');
  });
});

describe('置きに行った結果を、クライアント側の状態へ正しく戻す', () => {
  it('通った結果で、クライアント側の状態を丸ごと入れ替える', async () => {
    server.get.mockResolvedValue(body([], { state: 'absent', reason: 'no-source' }));
    server.set.mockResolvedValue({
      ok: true,
      body: body(['-w-a'], { state: 'observed', reason: null }),
    });

    const { result } = mount();
    await waitFor(() => expect(result.current.storedState).toBe('absent'));

    act(() => result.current.toggleWatch('-w-a'));

    await waitFor(() => expect(result.current.storedState).toBe('observed'));
    expect(result.current.watched).toEqual(new Set(['-w-a']));
  });

  it('断られたら、クライアント側の状態を元へ戻す', async () => {
    server.get.mockResolvedValue(body(['-w-a'], { state: 'observed', reason: null }));
    server.set.mockResolvedValue({
      ok: false,
      status: 403,
      body: {
        state: 'invalid',
        code: 'preferences.refused',
        message: '観測元の中には書かない',
      },
    });

    const { result } = mount();
    await waitFor(() => expect(result.current.watched).toEqual(new Set(['-w-a'])));

    act(() => result.current.toggleWatch('-w-b'));

    await waitFor(() => expect(result.current.error).not.toBeNull());
    expect(
      result.current.watched,
      '置けなかったのにタブだけ残ると、次に開いたときに黙って消える',
    ).toEqual(new Set(['-w-a']));
  });

  it('送るのは「何をしたいか」だけで、丸ごとの選択は送らない', async () => {
    server.get.mockResolvedValue(body(['-w-a'], { state: 'observed', reason: null }));
    server.set.mockResolvedValue({
      ok: true,
      body: body([], { state: 'observed', reason: null }),
    });

    const { result } = mount();
    await waitFor(() => expect(result.current.watched).toEqual(new Set(['-w-a'])));

    act(() => result.current.toggleWatch('-w-a'));

    await waitFor(() => expect(server.set).toHaveBeenCalled());
    expect(
      server.set.mock.calls.at(-1)?.[0],
      '丸ごと送ると、読んでから送るまでの間に別のクライアントが足したぶんが消える',
    ).toEqual({ data: { action: 'unwatch', id: '-w-a' } });
  });
});
