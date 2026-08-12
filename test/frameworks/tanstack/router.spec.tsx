import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

/* 起動を待っているあいだの画面。

   誰もが必ず一度は見る待ちなので、ここが黙っていると glasshive は最初に「しばらく黙るもの」
   として憶えられる。**それでも、観測していない割合は出せない。** 索引が届いていれば
   `transcript` の本数が在り、届いていなければ何も無い。ここで見るのはその 2 つと、
   **この画面が読み取りを始めないこと**である —— 始めるのはルートの loader で、
   待ちの表示が別の読み取りを起こすと、待たせている当のものが増える。 */

const { getTreeStream } = vi.hoisted(() => ({ getTreeStream: vi.fn() }));

vi.mock('~/frameworks/tanstack/functions/tree.ts', () => ({ getTreeStream }));

const { getRouter } = await import('~/frameworks/tanstack/router.tsx');

/** ルーターが待ちのときに描くもの。ルーターの外から名指せるのはここだけである */
const Pending = getRouter().options.defaultPendingComponent as () => React.ReactNode;

function draw(tree: unknown) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  if (tree !== undefined) client.setQueryData(['tree'], tree);
  return render(
    <QueryClientProvider client={client}>
      <Pending />
    </QueryClientProvider>,
  );
}

describe('起動を待っているあいだ', () => {
  it('索引が届いていれば、どこまで読んだかを数で言う', async () => {
    const { container } = draw({ progress: { read_transcripts: 12, total_transcripts: 48 } });

    await waitFor(() =>
      expect(
        container.querySelector('.rp-scan')?.textContent,
        '裸の「25%」は、何の 25% なのかを言わない',
      ).toBe('12 of 48 transcripts'),
    );
    expect(container.querySelector('[role="progressbar"]')?.getAttribute('aria-valuenow')).toBe(
      '25',
    );
  });

  it('索引が届いていなければ、輪郭だけのバーにする', () => {
    const { container } = draw(undefined);

    expect(
      container.querySelector('[role="progressbar"]')?.hasAttribute('aria-valuenow'),
      '分母を観測していない割合を、読み上げにだけ渡すことはできない',
    ).toBe(false);
    expect(
      container.querySelector('.rp-fill'),
      '塗る幅を持たないバーに、塗る要素は無い',
    ).toBeNull();
  });

  /* 待ちの表示が読み取りを起こすと、待たせている当のものが増える。読み取りを始めるのは
     ルートの loader で、ここはその進み具合を写すだけである。 */
  it('自分では読み取りを始めない', async () => {
    draw(undefined);
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(getTreeStream, '待ちの表示が、待たせている読み取りを増やす').not.toHaveBeenCalled();
  });
});
