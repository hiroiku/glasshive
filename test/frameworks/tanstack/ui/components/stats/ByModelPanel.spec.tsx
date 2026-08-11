import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ByModelPanel } from '~/frameworks/tanstack/ui/components/stats/ByModelPanel.tsx';
import type { StatsObservation } from '~/frameworks/tanstack/ui/components/stats/StatsObservation.tsx';

/* どのモデルがどれだけ使ったか。

   一覧が空になる理由は 2 つある。読んで何も無かったのと、読めなかったのである。
   **「no usage」と書けるのは前者だけ。** */

const draw = (
  models: readonly (readonly [string, number])[],
  observation: StatsObservation = { kind: 'observed' },
) => render(<ByModelPanel models={models} total={100} observation={observation} />);

describe('観測できた消費', () => {
  it('多い順にモデルを並べる', () => {
    const { container } = draw([
      ['claude-opus-4-20250514', 60],
      ['claude-haiku-4-20250514', 40],
    ]);

    const names = [...container.querySelectorAll('.sf-mname')].map((span) => span.textContent);
    expect(names).toEqual(['opus-4', 'haiku-4']);
  });

  it('読んで何も無かったなら、無かったと言う', () => {
    const { container } = draw([], { kind: 'absent' });

    expect(container.textContent).toContain('no usage in range');
  });
});

describe('観測できていないときの消費', () => {
  it('観測できなかった空を「no usage」と言わない', () => {
    const { container } = draw([], { kind: 'unobservable', reason: 'transcript.unreadable' });

    expect(
      container.textContent,
      '読めなかったプロジェクトは、使っていないプロジェクトではない',
    ).not.toContain('no usage in range');
    expect(container.querySelector('.sf-note')?.textContent).toBe('could not be read');
    expect(container.querySelector('.sf-note')?.getAttribute('title')).toBe(
      'Could not be read — transcript.unreadable',
    );
  });

  it('まだ答えが来ていない空も「no usage」と言わない', () => {
    const { container } = draw([], { kind: 'pending' });

    expect(container.textContent).not.toContain('no usage in range');
    expect(container.querySelector('.sf-note')?.textContent).toBe('reading…');
  });
});
