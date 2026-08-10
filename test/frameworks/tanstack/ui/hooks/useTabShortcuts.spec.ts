import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/* タブ行をキーボードから扱う。

   位置で選ぶショートカットなので、番号は**行の並びそのもの**でなければならない。1 が一覧、
   2 から先がピン留め。ピン留めには観測から消えたものも残るので、ピン留めの順で数えると
   画面に出ている位置と番号がずれる。 */

const { navigate } = vi.hoisted(() => ({ navigate: vi.fn() }));

vi.mock('@tanstack/react-router', () => ({ useNavigate: () => navigate }));

const { useTabShortcuts } = await import('~/frameworks/tanstack/ui/hooks/useTabShortcuts.ts');

const VISIBLE = ['alpha', 'bravo', 'charlie'];
const PINNED = ['alpha', '消えたプロジェクト', 'bravo', 'charlie'];

const onMove = vi.fn();

const mount = (current: string | null = 'bravo') =>
  renderHook(() => useTabShortcuts({ visible: VISIBLE, pinned: PINNED, current, onMove }));

/** この機械の ⌘ を押しながら 1 つ叩く */
const press = (key: string, over: KeyboardEventInit = {}) => {
  const apple = /Mac|iPhone|iPad/.test(navigator.userAgent);
  const event = new KeyboardEvent('keydown', {
    key,
    metaKey: apple,
    ctrlKey: !apple,
    cancelable: true,
    bubbles: true,
    ...over,
  });
  document.dispatchEvent(event);
  return event;
};

beforeEach(() => {
  navigate.mockReset();
  onMove.mockReset();
});

describe('位置で選ぶ', () => {
  it('1 は一覧へ行く', () => {
    mount();
    press('1');

    expect(navigate).toHaveBeenCalledWith({ to: '/' });
  });

  it('2 から先は行の並びのとおりに行く', () => {
    mount();
    press('3');

    expect(navigate).toHaveBeenCalledWith({
      to: '/projects/$slug',
      params: { slug: 'bravo' },
    });
  });

  /* そこにタブが無いのに隣へ飛ぶと、押したユーザーには「番号がずれている」としか見えない。 */
  it('そこにタブが無ければ何もしない', () => {
    mount();
    const event = press('9');

    expect(navigate).not.toHaveBeenCalled();
    expect(event.defaultPrevented, 'ブラウザーの持ち分は奪わない').toBe(false);
  });

  it('⌘ を押していなければ効かない', () => {
    mount();
    press('2', { metaKey: false, ctrlKey: false });

    expect(navigate).not.toHaveBeenCalled();
  });

  it('文字を打っている手からは奪わない', () => {
    mount();
    const box = document.createElement('input');
    document.body.appendChild(box);
    box.focus();
    box.dispatchEvent(
      new KeyboardEvent('keydown', { key: '2', metaKey: true, ctrlKey: true, bubbles: true }),
    );
    box.remove();

    expect(navigate).not.toHaveBeenCalled();
  });
});

describe('位置を入れ替える', () => {
  /* 置く先はピン留めの中での位置で言う。行に出ている位置で言うと、観測から消えた
     プロジェクトを跨ぐたびに 1 つぶん足りない場所へ落ちる。 */
  it('右へ動かすと、行の上の次の隣の位置へ置く', () => {
    mount('bravo');
    press('ArrowRight', { shiftKey: true });

    expect(onMove).toHaveBeenCalledWith('bravo', PINNED.indexOf('charlie'));
  });

  it('左へ動かすと、行の上の前の隣の位置へ置く', () => {
    mount('bravo');
    press('ArrowLeft', { shiftKey: true });

    expect(onMove).toHaveBeenCalledWith('bravo', PINNED.indexOf('alpha'));
  });

  it('行の端では動かさない', () => {
    mount('alpha');
    press('ArrowLeft', { shiftKey: true });

    expect(onMove).not.toHaveBeenCalled();
  });

  it('ピン留めしていないプロジェクトは動かせない', () => {
    mount('留めていないプロジェクト');
    press('ArrowRight', { shiftKey: true });

    expect(onMove).not.toHaveBeenCalled();
  });

  /* 押しっぱなしは 1 秒に何十回も来る。そのたびに `preferences.json` へ置きに行くと、
     どの並びが最後だったのか誰にも分からなくなる。 */
  it('押しっぱなしの連射では動かさない', () => {
    mount('bravo');
    press('ArrowRight', { shiftKey: true, repeat: true });

    expect(onMove).not.toHaveBeenCalled();
  });

  it('⇧ を押していなければ動かさない', () => {
    mount('bravo');
    press('ArrowRight');

    expect(onMove).not.toHaveBeenCalled();
  });
});
