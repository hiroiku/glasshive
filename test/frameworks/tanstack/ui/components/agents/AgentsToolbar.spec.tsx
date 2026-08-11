import { render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import {
  AgentsToolbar,
  type AgentsToolbarProps,
} from '~/frameworks/tanstack/ui/components/agents/AgentsToolbar.tsx';

/* 表のツールバー。**色だけで言っている状態を、言葉にする。**

   ここで見るのは 3 つ。押した / 押していないが `aria-pressed` で届くこと、
   勝手に増えていく検索の進み具合が読み上げられること、そして読めずに止まった検索が
   黙って表を狭めないことである。 */

const NOW = Date.parse('2026-08-09T12:00:00Z');

const mount = (overrides: Partial<AgentsToolbarProps> = {}) => {
  const props: AgentsToolbarProps = {
    query: '',
    onQuery: vi.fn(),
    deepNote: null,
    talk: false,
    onTalk: vi.fn(),
    talkNote: null,
    attention: false,
    onAttention: vi.fn(),
    scale: 'auto',
    onScale: vi.fn(),
    picked: false,
    axis: { t0: NOW - 3_600_000, t1: NOW },
    domain: { t0: NOW - 86_400_000, t1: NOW },
    onRange: vi.fn(),
    onCommitTime: () => vi.fn(),
    ...overrides,
  };
  return render(<AgentsToolbar {...props} />);
};

/** 出ている文字で絞り込みのチップを選ぶ */
const chipOf = (container: HTMLElement, text: string): HTMLElement => {
  const found = [...container.querySelectorAll('.fchip')].find((chip) =>
    (chip.textContent ?? '').startsWith(text),
  );
  if (found === undefined) throw new Error(`no chip is showing ${text}`);
  return found as HTMLElement;
};

describe('入り切りするチップは、押されているかどうかを名乗る', () => {
  it('メッセージの矢印', () => {
    const { container } = mount({ talk: true });

    expect(chipOf(container, '⇄').getAttribute('aria-pressed')).toBe('true');
  });

  it('注目の絞り込み', () => {
    const { container } = mount({ attention: false });

    expect(
      chipOf(container, '⚠').getAttribute('aria-pressed'),
      '色だけの違いは、読み上げにも弱視にも届かない',
    ).toBe('false');
  });

  it('タイムラインの倍率は、選んでいる 1 つだけが押されている', () => {
    const { container } = mount({ scale: 'auto', picked: false });
    const chips = [...container.querySelectorAll('.scale-chips .fchip')];

    expect(chips.length).toBeGreaterThan(1);
    expect(chips.filter((chip) => chip.getAttribute('aria-pressed') === 'true')).toHaveLength(1);
  });

  it('時間帯を手で選んでいる間は、どの倍率も押されていない', () => {
    const { container } = mount({ scale: 'auto', picked: true });
    const chips = [...container.querySelectorAll('.scale-chips .fchip')];

    expect(chips.filter((chip) => chip.getAttribute('aria-pressed') === 'true')).toEqual([]);
  });
});

/* 検索の結果は `transcript` を読みながら足されていく。画面は勝手に増えるのに、
   読み上げには何も届かない。 */
describe('勝手に変わる進み具合を、読み上げる', () => {
  it('進み具合は `status` として置く', () => {
    const { container } = mount({ deepNote: { scanned: 8, total: 40, unreadable: false } });
    const note = container.querySelector('.deep-note');

    expect(note?.getAttribute('role')).toBe('status');
    expect(note?.getAttribute('aria-live')).toBe('polite');
    expect(note?.textContent).toBe('8 / 40 transcripts');
  });
});

/* 読めずに止まった検索も、当たった一覧で表を絞り込み続ける。 */
describe('読めずに止まった検索を、黙って終わらせない', () => {
  it('数が 0 のままでも、読めなかったことを言う', () => {
    const { container } = mount({ deepNote: { scanned: 0, total: 0, unreadable: true } });
    const note = container.querySelector('.deep-note');

    expect(note?.textContent, '狭まった表が「その語はどこにも無い」と読める').toContain(
      'could not be read',
    );
  });

  it('絞り込みが効いたままであることを、ホバーしたときに言う', () => {
    const { container } = mount({ deepNote: { scanned: 0, total: 0, unreadable: true } });

    expect(container.querySelector('.deep-note')?.getAttribute('title')).toContain(
      'rows may be missing',
    );
  });
});

/* メッセージは `transcript` を走査して拾う。走査に失敗しても件数は 0 で返る。 */
describe('メッセージの数が、何を言っているのかを分ける', () => {
  const note = (over: Partial<NonNullable<AgentsToolbarProps['talkNote']>> = {}) => ({
    readable: true,
    messages: 12,
    marks: 5,
    dropped: 0,
    complete: true,
    ...over,
  });

  it('観測できなかった回は、数を名乗らない', () => {
    const { container } = mount({ talk: true, talkNote: note({ readable: false, messages: 0 }) });

    expect(chipOf(container, '⇄').textContent, '0 通は「一度も話さなかった」と読める').toBe('⇄ ?');
  });

  it('先頭まで届かなかった回は、数がそこまでだと言う', () => {
    const { container } = mount({ talk: true, talkNote: note({ complete: false }) });

    expect(chipOf(container, '⇄').textContent).toBe('⇄ ≥12');
    expect(chipOf(container, '⇄').getAttribute('title')).toContain('older than the scan window');
  });

  it('読み切った回は、数をそのまま出す', () => {
    const { container } = mount({ talk: true, talkNote: note() });

    expect(chipOf(container, '⇄').textContent).toBe('⇄ 12');
  });

  it('描けなかった数は、読めた回にだけ添える', () => {
    const { container } = mount({
      talk: true,
      talkNote: note({ readable: false, messages: 0, dropped: 3 }),
    });

    expect(chipOf(container, '⇄').querySelectorAll('.n')).toHaveLength(0);
  });
});

/* 同じ形の欄が 2 つ並ぶ。書式を名前にすると、どちらが始まりか読み上げから消える。 */
describe('時間帯の両端の欄に、別々の名前を付ける', () => {
  it('始まりと終わりを名乗る', () => {
    const { container } = mount();
    const names = [...container.querySelectorAll('.rs-time')].map((input) =>
      input.getAttribute('aria-label'),
    );

    expect(names).toHaveLength(2);
    expect(names[0]).toContain('Window start');
    expect(names[1]).toContain('Window end');
  });
});
