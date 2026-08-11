import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/* `transcript` の中身の検索。**読めたところから足していく。**

   ここで見るのは 3 つ。区切りをまたいで当たりが貯まること、語が変わったら走っている
   読み取りを捨てること、観測できなかった回を「当たらなかった」にしないことである。 */

const { fetchSearch } = vi.hoisted(() => ({ fetchSearch: vi.fn() }));

vi.mock('~/frameworks/tanstack/queries/sessions.query.ts', () => ({ fetchSearch }));

const { useDeepSearch } = await import('~/frameworks/tanstack/ui/hooks/useDeepSearch.ts');

/** 打ち込みが止まるのを待つ時間より長く待つ */
const SETTLED = { timeout: 2000 };

const page = (
  files: readonly string[],
  scanned: number,
  total: number,
  done: boolean,
  state = 'observed',
) => ({ ok: true, body: { state, reason: null, files, scanned, total, done } });

/** 頼まれた位置だけを並べる */
const asked = () => fetchSearch.mock.calls.map(([, , offset]) => offset);

beforeEach(() => {
  fetchSearch.mockReset();
});

describe('読めたところから足していく', () => {
  it('区切りを順に汲んで、当たりを貯める', async () => {
    fetchSearch
      .mockResolvedValueOnce(page(['/w/a.jsonl'], 2, 5, false))
      .mockResolvedValueOnce(page(['/w/c.jsonl'], 4, 5, false))
      .mockResolvedValueOnce(page([], 5, 5, true));

    const { result } = renderHook(() => useDeepSearch('hive', 'needle'));

    await waitFor(() => expect(fetchSearch).toHaveBeenCalledTimes(3), SETTLED);
    await waitFor(() => expect(result.current.running).toBe(false), SETTLED);
    expect([...result.current.files], '後の区切りで前の当たりを置き換えない').toEqual([
      '/w/a.jsonl',
      '/w/c.jsonl',
    ]);
    expect(result.current.scanned).toBe(5);
    expect(result.current.total).toBe(5);
    expect(asked(), '前の回が返した `scanned` から続ける').toEqual([0, 2, 4]);
  });

  it('打ち込んでいる途中の 1 文字ごとには頼まない', async () => {
    fetchSearch.mockResolvedValue(page([], 0, 0, true));

    const { rerender } = renderHook(({ q }: { q: string }) => useDeepSearch('hive', q), {
      initialProps: { q: 'ne' },
    });
    rerender({ q: 'nee' });
    rerender({ q: 'need' });

    await waitFor(() => expect(fetchSearch).toHaveBeenCalled(), SETTLED);
    expect(fetchSearch.mock.calls.map(([, query]) => query)).toEqual(['need']);
  });

  it('短すぎる語では頼まない', async () => {
    const { result } = renderHook(() => useDeepSearch('hive', 'n'));

    await new Promise((resolve) => setTimeout(resolve, 600));
    expect(fetchSearch).not.toHaveBeenCalled();
    expect(result.current.running).toBe(false);
    expect(result.current.files.size).toBe(0);
  });

  it('語が変わったら、走っている読み取りを捨てる', async () => {
    let landOld = (_: unknown) => {};
    const stale = new Promise((resolve) => {
      landOld = resolve;
    });
    fetchSearch.mockImplementation((_projectId: string, query: string) =>
      query === 'before' ? stale : Promise.resolve(page(['/w/after.jsonl'], 1, 1, true)),
    );

    const { result, rerender } = renderHook(({ q }: { q: string }) => useDeepSearch('hive', q), {
      initialProps: { q: 'before' },
    });
    await waitFor(() => expect(fetchSearch).toHaveBeenCalledTimes(1), SETTLED);

    rerender({ q: 'after' });
    await waitFor(() => expect(result.current.files.size).toBe(1), SETTLED);
    // 前の語の返事は、捨てた後になって届く
    landOld(page(['/w/before.jsonl'], 1, 1, true));
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect([...result.current.files], '前の語の当たりが次の語の結果に混ざってはいけない').toEqual([
      '/w/after.jsonl',
    ]);
  });
});

describe('観測できなかった回を、当たらなかったことにしない', () => {
  it('読めない `transcript` に当たったら、そこまでの本数を残して止まる', async () => {
    fetchSearch
      .mockResolvedValueOnce(page(['/w/a.jsonl'], 2, 5, false))
      .mockResolvedValueOnce(page([], 0, 0, false, 'unobservable'));

    const { result } = renderHook(() => useDeepSearch('hive', 'needle'));

    await waitFor(() => expect(fetchSearch).toHaveBeenCalledTimes(2), SETTLED);
    await waitFor(() => expect(result.current.running).toBe(false), SETTLED);
    expect([...result.current.files]).toEqual(['/w/a.jsonl']);
    expect(
      result.current.scanned,
      '読んだ本数が総数に届かないことが、途中で止まったことを言う',
    ).toBe(2);
    expect(result.current.total).toBe(5);
    expect(result.current.unreadable).toBe(true);
  });

  /* 1 回目で止まると `scanned` も `total` も 0 のままで、数では何も言えない。
     それでも当たりの一覧は絞り込みに効き続けるので、読めなかったことは別に持たせる。 */
  it('1 回目で読めなかったことを、数ではなく欄で言う', async () => {
    fetchSearch.mockResolvedValue(page([], 0, 0, false, 'unobservable'));

    const { result } = renderHook(() => useDeepSearch('hive', 'needle'));

    await waitFor(() => expect(fetchSearch).toHaveBeenCalledTimes(1), SETTLED);
    await waitFor(() => expect(result.current.running).toBe(false), SETTLED);
    expect(result.current.unreadable, '読めずに止まったことが、どこにも残っていない').toBe(true);
    expect(result.current.scanned).toBe(0);
    expect(result.current.total).toBe(0);
  });

  it('読み切った回は、読めなかったとは言わない', async () => {
    fetchSearch.mockResolvedValue(page(['/w/a.jsonl'], 3, 3, true));

    const { result } = renderHook(() => useDeepSearch('hive', 'needle'));

    await waitFor(() => expect(result.current.scanned).toBe(3), SETTLED);
    expect(result.current.unreadable).toBe(false);
  });

  it('位置が進まない答えでは、同じところを頼み続けない', async () => {
    fetchSearch.mockResolvedValue(page([], 0, 5, false));

    const { result } = renderHook(() => useDeepSearch('hive', 'needle'));

    await waitFor(() => expect(fetchSearch).toHaveBeenCalledTimes(1), SETTLED);
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(fetchSearch, '同じ位置を頼み直すと、いつまでも回り続ける').toHaveBeenCalledTimes(1);
    expect(result.current.running).toBe(false);
  });
});
