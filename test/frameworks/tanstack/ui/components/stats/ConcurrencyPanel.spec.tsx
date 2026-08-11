import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import {
  ConcurrencyPanel,
  type ConcurrencyPanelProps,
} from '~/frameworks/tanstack/ui/components/stats/ConcurrencyPanel.tsx';

/* 同時に動いていたエージェントの数。

   **読めなかった稼働区間を、静かだった時間として描かない。** 平らな階段は
   「誰も動いていなかった」という断定で、読めなかったこととは別の事実である。

   同時に、読めなかった 1 体を理由に、読めた分の階段まで消さない。消すと、
   19 本読めているプロジェクトが 1 本も読めていないプロジェクトと同じ絵になる。 */

const NOW = Date.parse('2026-08-09T12:34:56.000Z');
const FOOT_MS = 15 * 60_000;
const BARS = 4;

const draw = (over: Partial<ConcurrencyPanelProps> = {}) =>
  render(
    <ConcurrencyPanel
      counts={[0, 2, 1, 0]}
      unknown={[0, 0, 0, 0]}
      fromMs={NOW - BARS * FOOT_MS}
      footMs={FOOT_MS}
      bars={BARS}
      nowMs={NOW}
      liveNow={1}
      uncounted={false}
      observation={{ kind: 'observed' }}
      {...over}
    />,
  );

describe('観測できた稼働区間', () => {
  it('山の高さと、いま動いている数をそのまま出す', () => {
    const { container } = draw();

    expect(container.querySelector('.sf-big')?.textContent).toBe('peak 2');
    expect(container.querySelector('.sf-dim')?.textContent).toBe('now 1');
    expect(container.querySelector('svg')).not.toBeNull();
  });

  it('分からない数が 0 なら、面も注記も出さない', () => {
    const { container } = draw();

    expect(container.querySelector('.sf-uarea')).toBeNull();
    expect(container.querySelector('.sf-unk')).toBeNull();
  });
});

/* 読めた数と分からない数は、別の高さとして積む。足せば読めなかったことが動いていたことに
   なり、落とせば静かだったことになる。どちらも観測していないものを断定する。 */
describe('一部のエージェントの稼働区間を読めなかったとき', () => {
  const partial = { counts: [0, 19, 19, 0], unknown: [0, 1, 1, 0] };

  it('読めた分の階段は描く', () => {
    const { container } = draw(partial);

    expect(container.querySelector('.sf-cline'), '読めた 19 本ぶんが消えている').not.toBeNull();
    expect(container.querySelector('.sf-note')).toBeNull();
  });

  it('読めなかった分を、階段とは別の面として重ねる', () => {
    const { container } = draw(partial);

    expect(container.querySelector('.sf-uarea')?.getAttribute('d')).not.toBe('');
  });

  it('山の高さに、読めなかった数を添えて出す', () => {
    const { container } = draw(partial);

    expect(container.querySelector('.sf-big')?.textContent).toBe('peak 19');
    expect(container.querySelector('.sf-unk')?.textContent).toBe('+1 unknown');
  });

  it('読めなかったことを、指せば分かるようにする', () => {
    const { container } = draw(partial);

    expect(container.querySelector('.sf-unk')?.getAttribute('title')).toBe(
      'Agents whose activity could not be read',
    );
  });

  /* 面の意味は、ホバーできない人にも届かなければならない。 */
  it('面が何かを、グラフそのものの説明にも書く', () => {
    const { container } = draw(partial);

    expect(container.querySelector('svg title')?.textContent).toContain('could not be read');
  });

  /* 1 人も読めなかったときも同じ形で出す。0 の隣に読めなかった数が並ぶので、
     0 がひとりで「誰も動いていなかった」と名乗ることは無い。 */
  it('1 人も読めなかったときも、0 を裸で置かない', () => {
    const { container } = draw({ counts: [0, 0, 0, 0], unknown: [0, 3, 3, 0] });

    expect(container.querySelector('.sf-big')?.textContent).toBe('peak 0');
    expect(container.querySelector('.sf-unk')?.textContent).toBe('+3 unknown');
    expect(container.querySelector('.sf-uarea')).not.toBeNull();
  });
});

/* 子を数え上げられなかったセッションが在ると、数えられた高さは下限でしかない。
   **言い切ると、数え損ねた子が居なかったことになる。** 何人居たのかは分からないので、
   数を足すのではなく、その数が下限であることだけを言う。 */
describe('子を数え上げられなかったセッションが在るとき', () => {
  it('山の高さを言い切らない', () => {
    const { container } = draw({ uncounted: true });

    expect(
      container.querySelector('.sf-big')?.textContent,
      '数え損ねた子が居なかったことになっている',
    ).toBe('peak 2+');
  });

  it('数え損ねたことを、指せば分かるようにする', () => {
    const { container } = draw({ uncounted: true });

    expect(container.querySelector('.sf-big')?.getAttribute('title')).toBe(
      'At least this many — subagents in some sessions could not be counted',
    );
  });

  /* 数え上げられた分の階段まで消すと、1 本読めなかっただけのプロジェクトが
     1 本も読めていないプロジェクトと同じ絵になる。 */
  it('数え上げられた分の階段は描く', () => {
    const { container } = draw({ uncounted: true });

    expect(container.querySelector('.sf-cline')).not.toBeNull();
    expect(container.querySelector('.sf-note')).toBeNull();
  });

  /* 下限でしかないことは、ホバーできない人にも届かなければならない。 */
  it('数が下限であることを、グラフそのものの説明にも書く', () => {
    const { container } = draw({ uncounted: true });

    expect(container.querySelector('svg title')?.textContent).toContain('lower bound');
  });
});

describe('観測できていないときの稼働区間', () => {
  it('まだ読み終えていないなら、`0` を出さない', () => {
    const { container } = draw({
      counts: [0, 0, 0, 0],
      liveNow: 0,
      observation: { kind: 'pending' },
    });

    expect(container.querySelector('.sf-big')?.textContent, '`0` は断定である').toBe('peak —');
    expect(container.querySelector('.sf-dim')?.textContent).toBe('now —');
  });

  it('まだ読み終えていないなら、平らな階段を描かない', () => {
    const { container } = draw({
      counts: [0, 0, 0, 0],
      liveNow: 1,
      observation: { kind: 'pending' },
    });

    expect(container.querySelector('svg'), '空の階段は「静かだった」に見える').toBeNull();
    expect(container.querySelector('.sf-note')?.textContent).toBe('reading…');
  });

  /* `now` は稼働区間ではなくセッションの状態から来る。稼働区間を読めなかったことを
     理由に伏せると、観測できた事実まで一緒に消える。 */
  it('稼働区間を読めなくても、いま動いている数は出す', () => {
    const { container } = draw({
      counts: [0, 0, 0, 0],
      liveNow: 1,
      observation: { kind: 'unobservable', reason: null },
    });

    expect(container.querySelector('.sf-dim')?.textContent).toBe('now 1');
    expect(container.querySelector('.sf-big')?.textContent).toBe('peak ?');
  });

  it('まだ読み終えていないことを、指せば分かるようにする', () => {
    const { container } = draw({ observation: { kind: 'pending' } });

    expect(container.querySelector('.sf-note')?.getAttribute('title')).toBe('Not read yet');
  });
});
