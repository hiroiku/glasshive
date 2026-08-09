import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { useTabSelection } from '~/frameworks/tanstack/ui/hooks/useTabSelection.ts';

/* 画面が向こう側とやり取りする一区間。**ここが観測の最後の一歩である。**

   途中の層がどれだけ「無かった」と「見に行けなかった」を分けて運んでも、
   最後に画面が両方を同じ見た目へ倒せば、観る人にとっては潰れているのと変わらない。 */

const server = vi.hoisted(() => ({
  get: vi.fn(),
  set: vi.fn(),
}));

vi.mock('~/frameworks/tanstack/functions/preferences.ts', () => ({
  getPreferences: () => server.get(),
  setPreferences: (args: unknown) => server.set(args),
}));

/** 向こう側が返す形は、画面が受け取る形から取る。字を書き写すと、形が変わっても気づけない */
type Handle = ReturnType<typeof useTabSelection>;
type StoredState = Handle['storedState'];

interface PreferencesBody {
  tab_selection: Handle['selection'];
  visible_tabs: string[];
  stored: { state: StoredState; reason: string | null };
}

const body = (pinned: string[], stored: PreferencesBody['stored']): PreferencesBody => ({
  tab_selection: { version: 1, mode: 'all', pinned, hidden: [] },
  visible_tabs: pinned,
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

describe('覚え書きをどう読めたかを、画面まで落とさずに運ぶ', () => {
  it('読めた日は、読めたと名乗る', async () => {
    server.get.mockResolvedValue(body(['-w-a'], { state: 'observed', reason: null }));

    const { result } = mount();

    await waitFor(() => expect(result.current.storedState).toBe('observed'));
    expect(result.current.pinned).toEqual(new Set(['-w-a']));
  });

  it('まだ覚え書きが無い日は、無いと名乗る', async () => {
    server.get.mockResolvedValue(body([], { state: 'absent', reason: 'no-source' }));

    const { result } = mount();

    await waitFor(() => expect(result.current.storedState).toBe('absent'));
  });

  it('向こう側が読めなかった日は、そのまま読めなかったと名乗る', async () => {
    server.get.mockResolvedValue(
      body([], { state: 'unobservable', reason: 'preferences.unreadable' }),
    );

    const { result } = mount();

    await waitFor(() => expect(result.current.storedState).toBe('unobservable'));
  });

  it('取りに行って落ちた日は、「留めていない」と名乗らない', async () => {
    server.get.mockRejectedValue(new Error('つながらない'));

    const { result } = mount();

    await waitFor(() =>
      expect(
        result.current.storedState,
        '答えを一度も受け取れていないのを absent と名乗ると、印が黙って消えたようにしか見えない',
      ).toBe('unobservable'),
    );
    expect(result.current.pinned, '留めた印は分からないので、空で描くほかない').toEqual(new Set());
  });

  it('まだ届いていない間は、何も言わない', () => {
    // 届く前から「読めなかった」と言うと、開くたびに断りが一瞬出る
    server.get.mockReturnValue(new Promise(() => {}));

    const { result } = mount();

    expect(result.current.storedState).toBe('absent');
  });
});

describe('置きに行った答えを、手元へ正しく戻す', () => {
  it('通った答えで、手元を丸ごと入れ替える', async () => {
    server.get.mockResolvedValue(body([], { state: 'absent', reason: 'no-source' }));
    server.set.mockResolvedValue({
      ok: true,
      body: body(['-w-a'], { state: 'observed', reason: null }),
    });

    const { result } = mount();
    await waitFor(() => expect(result.current.storedState).toBe('absent'));

    act(() => result.current.togglePin('-w-a'));

    await waitFor(() => expect(result.current.storedState).toBe('observed'));
    expect(result.current.pinned).toEqual(new Set(['-w-a']));
  });

  it('断られたら、手元を元へ戻す', async () => {
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
    await waitFor(() => expect(result.current.pinned).toEqual(new Set(['-w-a'])));

    act(() => result.current.togglePin('-w-b'));

    await waitFor(() => expect(result.current.error).not.toBeNull());
    expect(
      result.current.pinned,
      '置けなかったのに印だけ残ると、次に開いたときに黙って消える',
    ).toEqual(new Set(['-w-a']));
  });

  it('送るのは「何をしたいか」だけで、丸ごとの選びは送らない', async () => {
    server.get.mockResolvedValue(body(['-w-a'], { state: 'observed', reason: null }));
    server.set.mockResolvedValue({
      ok: true,
      body: body([], { state: 'observed', reason: null }),
    });

    const { result } = mount();
    await waitFor(() => expect(result.current.pinned).toEqual(new Set(['-w-a'])));

    act(() => result.current.togglePin('-w-a'));

    await waitFor(() => expect(server.set).toHaveBeenCalled());
    expect(
      server.set.mock.calls.at(-1)?.[0],
      '丸ごと送ると、読んでから送るまでの間に別の窓が留めたぶんが消える',
    ).toEqual({ data: { action: 'unpin', id: '-w-a' } });
  });
});
