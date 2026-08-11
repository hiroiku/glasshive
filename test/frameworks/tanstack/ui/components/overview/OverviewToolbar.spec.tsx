import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import {
  OverviewToolbar,
  type OverviewToolbarProps,
} from '~/frameworks/tanstack/ui/components/overview/OverviewToolbar.tsx';

/* ツールバーの 1 行は、区切りの中黒で 4 つの数を並べる。

   JSX は要素と式のあいだの改行を含む空白を落とすので、区切りの前の空白は
   `{' '}` で置かないと消える。数と中黒がくっつくと、`active 5·` が 1 つの語に見える。 */

const draw = (over: Partial<OverviewToolbarProps> = {}) => {
  const { container } = render(
    <OverviewToolbar
      query=""
      onQuery={() => undefined}
      filter="all"
      onFilter={() => undefined}
      span="30d"
      onSpan={() => undefined}
      totals={{
        active: 5,
        waiting: 3,
        input: 1,
        tokens: 0,
        tokensPartial: false,
        partial: false,
        unreadable: false,
      }}
      shown={4}
      total={4}
      progress={null}
      {...over}
    />,
  );
  return {
    container,
    summary: container.querySelector('.dash-sum')?.textContent ?? '',
  };
};

describe('Overview のツールバーの 1 行', () => {
  it('数と区切りのあいだに空白を置く', () => {
    const { summary } = draw();

    expect(summary).toContain('active 5 · waiting 3 · input 1');
  });

  it('数え終えていない合計には `+?` を添えて、それでも区切りは詰めない', () => {
    const { summary } = draw({
      totals: {
        active: 5,
        waiting: 3,
        input: 1,
        tokens: 0,
        tokensPartial: true,
        partial: true,
        unreadable: false,
      },
    });

    expect(summary).toContain('active 5+? · waiting 3+? · input 1+?');
  });

  /* 読んでいる途中なら待てば揃う。読めなかったものは待っても揃わない。
     同じ文で伝えると、ユーザーはいつまでも揃うのを待つ。 */
  it('数え上げられなかった行が在ることを、読んでいる途中と同じ文で言わない', () => {
    const reading = draw({
      totals: {
        active: 5,
        waiting: 3,
        input: 1,
        tokens: 0,
        tokensPartial: true,
        partial: true,
        unreadable: false,
      },
    });
    const blind = draw({
      totals: {
        active: 5,
        waiting: 3,
        input: 1,
        tokens: 0,
        tokensPartial: true,
        partial: true,
        unreadable: true,
      },
    });

    const titleOf = (found: ReturnType<typeof draw>) =>
      found.container.querySelector('.dash-sum .dimtxt')?.getAttribute('title') ?? '';

    expect(titleOf(reading)).toBe('Counted from the projects read so far');
    expect(titleOf(blind)).toBe('Some projects could not be read — the counts may be short');
  });

  it('人待ちが 0 のときは、その欄ごと出さない', () => {
    const { summary } = draw({
      totals: {
        active: 5,
        waiting: 3,
        input: 0,
        tokens: 0,
        tokensPartial: false,
        partial: false,
        unreadable: false,
      },
    });

    expect(summary).toContain('active 5 · waiting 3 · tokens 24h');
  });
});

describe('絞り込みのチップ', () => {
  it('押されている状態を、色ではなく状態として持つ', () => {
    const { container } = draw({ filter: 'input' });
    const chips = [...container.querySelectorAll<HTMLButtonElement>('.fchip')];
    const on = chips.filter((chip) => chip.getAttribute('aria-pressed') === 'true');

    expect(
      on.map((chip) => chip.textContent),
      '状態と期間はそれぞれ 1 つずつ押されている',
    ).toEqual(['input', '30d']);
  });
});
