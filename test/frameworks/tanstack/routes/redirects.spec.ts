import { isRedirect } from '@tanstack/react-router';
import { describe, expect, it } from 'vitest';
import { Route as GitRoute } from '~/frameworks/tanstack/routes/projects.$slug.git.tsx';
import { type ProjectSearch, parseProjectSearch } from '~/frameworks/tanstack/ui/nav/search.ts';

/* 送り先だけのルートなので、`beforeLoad` を直に呼んで投げられたものを見る。

   ルーターを組み立てて辿らせても分かるのは同じことで、そちらは親の `/projects/$slug` の
   loader まで走り、観測を取りに行くところまで連れてくる。**確かめたいのは、古い URL が
   載せていた検索パラメータが行き先まで届くことだけである。** */

/** 投げられたリダイレクトが載せているもの */
interface Forwarded {
  readonly to: unknown;
  readonly params: unknown;
  readonly search: Record<string, unknown>;
  readonly replace: unknown;
}

const forward = (route: { readonly options: unknown }, search: ProjectSearch): Forwarded => {
  const beforeLoad = (route.options as { beforeLoad: unknown }).beforeLoad as (context: {
    params: { slug: string };
    search: ProjectSearch;
  }) => void;
  try {
    beforeLoad({ params: { slug: 'demo' }, search });
  } catch (thrown) {
    if (isRedirect(thrown)) return thrown.options as unknown as Forwarded;
    throw thrown;
  }
  throw new Error('the route did not redirect');
};

/** パネルと絞り込みが載った、そのまま人へ渡せる URL */
const opened: ProjectSearch = {
  panel: 'ref',
  pv: 'a1b2c3d',
  pl: 'feat/tabs',
  q: 'auth',
  status: 'open',
};

describe('1.2.0 より前のリンクを Work へ送る', () => {
  it('`/git` はブランチの一覧を開く', () => {
    const options = forward(GitRoute, {});
    expect(options.to).toBe('/projects/$slug/work');
    expect(options.params).toEqual({ slug: 'demo' });
    expect(
      options.search,
      'Git の画面が見せていたのはブランチである。既定の課題の一覧では別の画面になる',
    ).toEqual({ unit: 'branches' });
  });

  it('パネルと絞り込みは、そのまま渡る', () => {
    expect(forward(GitRoute, opened).search).toEqual({ ...opened, unit: 'branches' });
  });

  it('渡した検索パラメータは、行き先でもそのまま読める', () => {
    const { search } = forward(GitRoute, opened);
    expect(
      parseProjectSearch(search),
      '行き先が読めない欄を載せると、渡した先で黙って落ちる',
    ).toEqual(search);
  });

  it('古い URL は履歴に残さない', () => {
    expect(
      forward(GitRoute, opened).replace,
      '戻るを押して、送り出されるだけのルートへ帰らせない',
    ).toBe(true);
  });
});
