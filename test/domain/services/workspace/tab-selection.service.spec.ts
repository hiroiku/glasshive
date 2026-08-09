import { describe, expect, it } from 'vitest';
import {
  move,
  pin,
  reconcile,
  unpin,
  visibleTabs,
} from '~/domain/services/workspace/tab-selection.service.ts';
import {
  DEFAULT_TAB_SELECTION,
  type TabSelection,
} from '~/domain/value-objects/workspace/tab-selection.value-object.ts';

const selectionOf = (parts: Partial<TabSelection>): TabSelection => ({
  ...DEFAULT_TAB_SELECTION,
  ...parts,
});

describe('覚え書きの形を整える', () => {
  it('一覧から消えた id も、留めたまま残す', () => {
    const selection = selectionOf({
      pinned: ['-w-alpha', '-w-gone', '-w-beta'],
    });

    expect(
      reconcile(selection).pinned,
      '作業領域は外して後で繋ぎ直される。そのたびに留め直させると、机の並びが毎回崩れる',
    ).toEqual(['-w-alpha', '-w-gone', '-w-beta']);
  });

  it('整えても、選びは減らない', () => {
    const selection = selectionOf({
      pinned: ['-w-alpha'],
      hidden: ['-w-noise'],
    });

    expect(
      reconcile(selection),
      '観測で削る道をここに作らない。作ると、置き場を一度読めなかった日に選びが丸ごと消える',
    ).toEqual(selectionOf({ pinned: ['-w-alpha'], hidden: ['-w-noise'] }));
  });

  it('整えても、選びは増えない', () => {
    expect(
      reconcile(DEFAULT_TAB_SELECTION).pinned,
      '選びは観測を作り出さない。覚え書きには人が選んだものしか入らない',
    ).toEqual([]);
  });

  it('重複は落とし、順は先に出てきたほうを残す', () => {
    expect(reconcile(selectionOf({ pinned: ['-w-b', '-w-a', '-w-b'] })).pinned).toEqual([
      '-w-b',
      '-w-a',
    ]);
  });

  it('留めたものと伏せたものが食い違えば、留めたほうが勝つ', () => {
    expect(
      reconcile(selectionOf({ pinned: ['-w-a'], hidden: ['-w-a', '-w-b'] })).hidden,
      '同じ id が両方に居ると、出すのか伏せるのかを読む側が推し量ることになる',
    ).toEqual(['-w-b']);
  });

  it('空の字は id ではないので、覚えない', () => {
    expect(
      reconcile(selectionOf({ pinned: ['', '-w-a'], hidden: [''] })),
      '名前の無いタブは押しても開けない。残すと、消し方の分からない行が机に居座る',
    ).toEqual(selectionOf({ pinned: ['-w-a'], hidden: [] }));
  });

  it('絞り方はそのまま持ち越す', () => {
    expect(reconcile(selectionOf({ mode: 'pinned' })).mode).toBe('pinned');
  });
});

describe('タブに出す対象', () => {
  it('留めてあっても、観測していない id は出さない', () => {
    const selection = selectionOf({
      pinned: ['-w-alpha', '-w-gone', '-w-beta'],
    });
    const observed = ['-w-alpha', '-w-beta'];

    expect(
      reconcile(selection).pinned,
      '「残す」ことと「出す」ことは別である。留めた印は覚え書きに残る',
    ).toContain('-w-gone');
    expect(
      visibleTabs(selection, observed),
      '出すと、消えた作業領域を指すタブが残り、押しても何も無い窓が開く',
    ).toEqual(['-w-alpha', '-w-beta']);
  });

  it('並びは留めた順のまま。観測の順には従わない', () => {
    expect(
      visibleTabs(selectionOf({ pinned: ['-w-b', '-w-a'] }), ['-w-a', '-w-b']),
      '留めたものは自分の机の並び。名前順や観測順を強いると、関わりのある巣を隣に置けない',
    ).toEqual(['-w-b', '-w-a']);
  });

  it('観測に在っても、留めていなければ出さない', () => {
    expect(
      visibleTabs(DEFAULT_TAB_SELECTION, ['-w-alpha']),
      '留めたものが無いときは Overview だけを出す。道具が推し量って足さない',
    ).toEqual([]);
  });
});

describe('留める', () => {
  it('末尾へ足す', () => {
    expect(pin(selectionOf({ pinned: ['-w-a'] }), '-w-b').pinned).toEqual(['-w-a', '-w-b']);
  });

  it('既に留めてあれば、順を変えない', () => {
    expect(
      pin(selectionOf({ pinned: ['-w-a', '-w-b'] }), '-w-a').pinned,
      '同じものを二度押しただけで机の並びが変わると、位置の記憶が壊れる',
    ).toEqual(['-w-a', '-w-b']);
  });

  it('伏せてあったものを留めると、伏せは解ける', () => {
    const next = pin(selectionOf({ hidden: ['-w-a'] }), '-w-a');
    expect(next.pinned).toEqual(['-w-a']);
    expect(next.hidden, '留めたのに一覧から伏せたままでは、言うことが食い違う').toEqual([]);
  });

  it('場所として使えない名前は覚えない', () => {
    expect(pin(DEFAULT_TAB_SELECTION, '').pinned).toEqual([]);
  });
});

describe('外す', () => {
  it('留めたものから落とす', () => {
    expect(unpin(selectionOf({ pinned: ['-w-a', '-w-b'] }), '-w-a').pinned).toEqual(['-w-b']);
  });

  it('伏せるほうへは移さない', () => {
    expect(
      unpin(selectionOf({ pinned: ['-w-a'] }), '-w-a').hidden,
      '外すのは机から下ろすことで、一覧から消すことではない。消すと戻し方が分からなくなる',
    ).toEqual([]);
  });

  it('留めていないものを外しても、何も起きない', () => {
    expect(unpin(selectionOf({ pinned: ['-w-a'] }), '-w-x').pinned).toEqual(['-w-a']);
  });
});

describe('並べ替える', () => {
  it('落とした先へ差し込む', () => {
    expect(move(selectionOf({ pinned: ['-w-a', '-w-b', '-w-c'] }), '-w-c', 0).pinned).toEqual([
      '-w-c',
      '-w-a',
      '-w-b',
    ]);
    expect(move(selectionOf({ pinned: ['-w-a', '-w-b', '-w-c'] }), '-w-a', 1).pinned).toEqual([
      '-w-b',
      '-w-a',
      '-w-c',
    ]);
  });

  it('端をはみ出した先は、端で丸める', () => {
    expect(move(selectionOf({ pinned: ['-w-a', '-w-b'] }), '-w-a', 99).pinned).toEqual([
      '-w-b',
      '-w-a',
    ]);
    expect(move(selectionOf({ pinned: ['-w-a', '-w-b'] }), '-w-b', -5).pinned).toEqual([
      '-w-b',
      '-w-a',
    ]);

    /* **負の落とし先は 0 で丸める。** 丸めずに差し込む役へ渡すと、負の数は末尾から数えた
       場所と読まれる。留めたものが 2 つまでの組ではどちらでも同じ並びになるので、
       丸めているかどうかは 3 つ以上でしか見えない。 */
    expect(
      move(selectionOf({ pinned: ['-w-a', '-w-b', '-w-c'] }), '-w-a', -1).pinned,
      '負の落とし先が末尾から数えた場所になると、押した場所と違うところへ落ちる',
    ).toEqual(['-w-a', '-w-b', '-w-c']);
  });

  it('留めていないものは動かせない', () => {
    const selection = selectionOf({ pinned: ['-w-a'] });
    expect(
      move(selection, '-w-x', 0).pinned,
      '並べ替えが選びを増やすと、机に置いた覚えの無いタブが現れる',
    ).toEqual(['-w-a']);
  });

  it('数でない落とし先は、何もしない', () => {
    /* **動かせば並びが変わる id で見る。** 落とし先が今いる場所と重なる組で見ると、
       門が無くても同じ並びになり、門が在ることを何も確かめないことになる。 */
    expect(
      move(selectionOf({ pinned: ['-w-a', '-w-b'] }), '-w-b', Number.NaN).pinned,
      '数として読めない落とし先を丸める役へ渡すと、先頭へ落ちる',
    ).toEqual(['-w-a', '-w-b']);
    expect(
      move(selectionOf({ pinned: ['-w-a', '-w-b'] }), '-w-a', Number.POSITIVE_INFINITY).pinned,
      '果ての無い数は端で丸まってしまい、動かさないつもりが末尾へ落ちる',
    ).toEqual(['-w-a', '-w-b']);
  });
});
