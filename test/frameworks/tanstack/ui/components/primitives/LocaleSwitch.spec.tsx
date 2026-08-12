import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { LocaleSwitch } from '~/frameworks/tanstack/ui/components/primitives/LocaleSwitch.tsx';
import { LocaleProvider } from '~/frameworks/tanstack/ui/i18n/LocaleContext.tsx';

/* 画面の言葉を選ぶところ。

   ブラウザーの `select` をやめて自前で組んだので、`select` が黙って持っていたものを
   こちらで持たなければならない。**選ばれている行がどれかと、キーボードだけで選べること**
   の 2 つである。どちらも見た目ではなく属性と焦点で決まるので、ここで見る。

   合わせた先を添える行も見る。「ブラウザーに合わせる」だけでは、それが何になるのかが
   画面のどこにも出ない。 */

const server = vi.hoisted(() => ({ get: vi.fn(), set: vi.fn() }));

vi.mock('~/frameworks/tanstack/functions/preferences.ts', () => ({
  getPreferences: () => server.get(),
  setPreferences: (args: unknown) => server.set(args),
}));

const body = (locale: string | null) => ({
  tab_selection: { version: 1, mode: 'all', pinned: [], hidden: [] },
  visible_tabs: [],
  locale,
  stored: { state: 'observed', reason: null },
});

function mount(locale: string | null) {
  server.get.mockResolvedValue(body(locale));
  server.set.mockImplementation((args: { data: { locale: string | null } }) => ({
    ok: true,
    body: body(args.data.locale),
  }));
  server.set.mockClear();
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>
      <LocaleProvider>{children}</LocaleProvider>
    </QueryClientProvider>
  );
  return render(<LocaleSwitch />, { wrapper });
}

/** `preferences.json` が届いてから開く。届く前は、まだ誰も何も選んでいない画面である */
async function openMenu(current: string) {
  await waitFor(() => expect(screen.getByRole('button').textContent).toContain(current));
  fireEvent.click(screen.getByRole('button', { expanded: false }));
}

describe('言葉を選ぶ一覧', () => {
  it('選ばれている言葉だけが、選ばれていると名乗る', async () => {
    mount('ja');
    await openMenu('日本語');

    const selected = screen
      .getAllByRole('option')
      .filter((option) => option.getAttribute('aria-selected') === 'true');

    expect(
      selected.map((option) => option.textContent),
      '選ばれている行が読み上げに出ないと、いまどれなのかは色でしか分からない',
    ).toEqual(['日本語']);
  });

  it('何も選んでいなければ、ブラウザーに合わせる行が選ばれている', async () => {
    mount(null);
    await openMenu('English');

    const selected = screen
      .getAllByRole('option')
      .filter((option) => option.getAttribute('aria-selected') === 'true');

    expect(selected.length, '選ばれている行がどこにも無いと、戻り先が無いように見える').toBe(1);
    expect(selected[0]?.className).toContain('lsw-follow');
  });

  /* 合わせた先は `LOCALE_NAMES` から来る。英語の名前を並べると、いま読めない画面に
     居る人が自分の言葉を探せない */
  it('ブラウザーに合わせる行に、いま当たっている言葉を添える', async () => {
    mount(null);
    await openMenu('English');

    const follow = screen.getAllByRole('option')[0];

    expect(
      follow?.querySelector('.lsw-hint')?.textContent,
      '合わせた先が読めないと、この行を選ぶかどうかを決められない',
    ).toBe('English');
  });

  it('名前は、その言葉の `lang` を添えて出す', async () => {
    mount('en');
    await openMenu('English');

    const langs = screen
      .getAllByRole('option')
      .map((option) => option.querySelector('.lsw-name')?.getAttribute('lang'));

    expect(langs, '`lang` が無いと、同じ漢字が日本語の書体のまま中国語として出る').toEqual([
      null,
      'en',
      'ja',
      'zh-Hans',
      'zh-Hant',
      'ko',
    ]);
  });

  it('矢印で行を移り、Enter で選べる', async () => {
    mount(null);
    await openMenu('English');

    const list = screen.getByRole('listbox');
    fireEvent.keyDown(list, { key: 'ArrowDown' });
    fireEvent.keyDown(list, { key: 'ArrowDown' });
    fireEvent.click(document.activeElement as HTMLElement);

    await waitFor(() =>
      expect(server.set, 'キーボードだけで選べないと、選び直せない人が出る').toHaveBeenCalledWith({
        data: { action: 'locale', locale: 'ja' },
      }),
    );
  });

  it('Escape で閉じて、押しどころへ焦点が戻る', async () => {
    mount('ja');
    await openMenu('日本語');

    fireEvent.keyDown(screen.getByRole('listbox'), { key: 'Escape' });

    expect(screen.queryByRole('listbox'), '閉じないと、後ろの画面を操作できない').toBeNull();
    expect(document.activeElement, '焦点が行ごと消えると、キーボードは画面の先頭へ戻される').toBe(
      screen.getByRole('button'),
    );
  });

  it('選ぶと閉じて、選んだ言葉をサーバーへ渡す', async () => {
    mount(null);
    await openMenu('English');

    fireEvent.click(screen.getByText('한국어'));

    await waitFor(() =>
      expect(server.set).toHaveBeenCalledWith({ data: { action: 'locale', locale: 'ko' } }),
    );
    expect(screen.queryByRole('listbox'), '選んだ後も開いたままだと、押し間違える').toBeNull();
  });
});
