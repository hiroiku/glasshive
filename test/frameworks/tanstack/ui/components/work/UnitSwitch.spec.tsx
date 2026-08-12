import { render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { UnitSwitch } from '~/frameworks/tanstack/ui/components/work/UnitSwitch.tsx';

/* 単位の切り替えに添えた件数。

   確かめるのは 1 つ —— **数えられなかったことを 0 で出さないか**。0 は「向こうに 1 件も
   無い」という断定なので、読みに行けていないときに出すと、切り替える必要が無いように読める。
   まだ来ていないのと読めなかったのも分けて出す。待てば揃うのか揃わないのかが違う。 */

const draw = (over: Partial<Parameters<typeof UnitSwitch>[0]> = {}) =>
  render(
    <UnitSwitch
      unit={null}
      onUnit={vi.fn()}
      issueCount={12}
      branchCount={3}
      milestoneCount={2}
      {...over}
    />,
  ).container;

const marks = (container: HTMLElement) =>
  [...container.querySelectorAll('.n')].map((node) => node.textContent);

describe('切り替えに添える件数', () => {
  it('数えられていれば、その数を出す', () => {
    expect(marks(draw())).toEqual(['12', '3', '2']);
  });

  it('読めなかった件数は、0 ではなく `?` で出す', () => {
    const container = draw({ branchCount: 'unobservable' });

    expect(marks(container), '0 と出すと、ブランチが 1 本も無いことになる').toEqual([
      '12',
      '?',
      '2',
    ]);
    expect(
      container.querySelectorAll('.n')[1]?.getAttribute('title'),
      'なぜ数が無いのかを言わないと、0 と同じ読み方をされる',
    ).toContain('could not be read');
  });

  /* 待てば揃うのと、待っても揃わないのを同じ絵にすると、失敗が読み込み中の顔で居座る */
  it('まだ数え終えていない件数は、読めなかったのとは別の絵で出す', () => {
    const container = draw({ issueCount: 'pending', milestoneCount: 'pending' });

    expect(marks(container)).toEqual(['—', '3', '—']);
    expect(container.querySelector('.n')?.getAttribute('title')).toContain('Still counting');
  });
});
