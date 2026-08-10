import { describe, expect, it, vi } from 'vitest';
import { pressable } from '~/frameworks/tanstack/ui/pressable.ts';

/* 押せるところを、キーボードからも押せるようにする。

   行もチップも button に置き換えられない(入れ子のグリッドが崩れる、行の中にチップが居る)ので、
   キー入力のハンドラだけをここが持つ。**見た目が押せるところなら、button と同じキーで動く**こと。 */

type KeyEvent = Parameters<ReturnType<typeof pressable>['onKeyDown']>[0];

const keyEvent = (key: string): KeyEvent => {
  const event = {
    key,
    preventDefault: vi.fn(),
    stopPropagation: vi.fn(),
  };
  return event as unknown as KeyEvent;
};

const mouseEvent = () =>
  ({ stopPropagation: vi.fn() }) as unknown as Parameters<
    ReturnType<typeof pressable>['onClick']
  >[0];

describe('キーボードから押す', () => {
  it('Enter で押したことになる', () => {
    const activate = vi.fn();
    pressable(activate).onKeyDown(keyEvent('Enter'));

    expect(activate).toHaveBeenCalledTimes(1);
  });

  it('空白でも押したことになる', () => {
    const activate = vi.fn();
    pressable(activate).onKeyDown(keyEvent(' '));

    expect(activate).toHaveBeenCalledTimes(1);
  });

  /* 空白は既定では画面を送るキーである。受け切らないと、押すたびに一覧が飛ぶ。 */
  it('空白は受け切って、画面を送らせない', () => {
    const event = keyEvent(' ');
    pressable(vi.fn()).onKeyDown(event);

    expect(event.preventDefault).toHaveBeenCalled();
  });

  it('ほかのキーでは何もしない', () => {
    const activate = vi.fn();
    const event = keyEvent('a');
    pressable(activate).onKeyDown(event);

    expect(activate).not.toHaveBeenCalled();
    expect(event.preventDefault, '受け切ると、文字を打つ手からキーを奪う').not.toHaveBeenCalled();
  });
});

describe('外側へ伝えるか', () => {
  /* チップは行の中に居る。伝えたままだと、チップを押しただけで行の押せるところまで走り、
     開くつもりのなかったパネルが開く。 */
  it('止めると言われたら、外側へ伝えない', () => {
    const event = mouseEvent();
    pressable(vi.fn(), { stopPropagation: true }).onClick(event);

    expect(event.stopPropagation).toHaveBeenCalled();
  });

  it('既定では止めない', () => {
    const event = mouseEvent();
    pressable(vi.fn()).onClick(event);

    expect(event.stopPropagation).not.toHaveBeenCalled();
  });

  it('キーボードから押したときも同じように止める', () => {
    const event = keyEvent('Enter');
    pressable(vi.fn(), { stopPropagation: true }).onKeyDown(event);

    expect(event.stopPropagation).toHaveBeenCalled();
  });
});
