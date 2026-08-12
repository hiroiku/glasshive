import { QueryClient } from '@tanstack/react-query';
import { isRedirect } from '@tanstack/react-router';
import { describe, expect, it, vi } from 'vitest';

/* 名指されたディレクトリを開く入口。

   ここに留まる画面は無い。**答えが出た時点でプロジェクトの URL へ置き換わる。** 見るのは
   行き先と、名指されていないときに Overview へ戻ることである —— 名指されていないのは
   誤りではないので、断ってはいけない。 */

const { getTarget } = vi.hoisted(() => ({ getTarget: vi.fn() }));

vi.mock('~/frameworks/tanstack/functions/target.ts', () => ({ getTarget }));

const { Route } = await import('~/frameworks/tanstack/routes/here.tsx');

/** 投げられたリダイレクトが載せているもの */
interface Forwarded {
  readonly to: unknown;
  readonly params: unknown;
  readonly search: Record<string, unknown>;
  readonly replace: unknown;
}

async function open(target: unknown): Promise<Forwarded> {
  getTarget.mockResolvedValue(target);
  const loader = (Route.options as { loader: unknown }).loader as (context: {
    context: { queryClient: QueryClient };
  }) => Promise<void>;
  try {
    await loader({ context: { queryClient: new QueryClient() } });
  } catch (thrown) {
    if (isRedirect(thrown)) return thrown.options as unknown as Forwarded;
    throw thrown;
  }
  throw new Error('the route did not redirect');
}

describe('名指されたディレクトリを開く', () => {
  it('そのプロジェクトの Work を、1 つだけ開いている枠で出す', async () => {
    const options = await open({
      requested_path: '/src/repo',
      root_path: '/src/repo',
      name: 'repo',
      project_id: 'the-repo',
      siblings: [],
    });

    expect(
      options.to,
      'issue とブランチは `transcript` が 1 本も無くても読める。着く先はここでよい',
    ).toBe('/projects/$slug/work');
    expect(options.params).toEqual({ slug: 'the-repo' });
    expect(options.search, '枠の出し方は URL に載る。読み込み直しても変わらない').toEqual({
      only: true,
    });
    expect(options.replace, '戻るを押して、送り出されるだけのルートへ帰らせない').toBe(true);
  });

  it('名指されていなければ、Overview を開く', async () => {
    const options = await open(null);

    expect(options.to, '名指されていないことは誤りではない。断らずに Overview を出す').toBe('/');
    expect(options.replace).toBe(true);
  });

  /* 名指されたが、そこに開くプロジェクトが無い。索引が届かなかったときに起きる。 */
  it('開くプロジェクトが決まらなければ、Overview を開く', async () => {
    const options = await open({
      requested_path: '/src/fresh',
      root_path: '/src/fresh',
      name: 'fresh',
      project_id: null,
      siblings: [],
    });

    expect(options.to).toBe('/');
  });
});
