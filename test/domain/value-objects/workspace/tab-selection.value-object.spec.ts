import { describe, expect, it } from 'vitest';
import {
  DEFAULT_TAB_SELECTION,
  parseTabSelection,
  serializeTabSelection,
  type TabSelection,
} from '~/domain/value-objects/workspace/tab-selection.value-object.ts';

const SELECTION: TabSelection = {
  version: 1,
  mode: 'pinned',
  pinned: ['-w-alpha', '-w-beta'],
  hidden: ['-w-noise'],
};

describe('覚え書きの字を読み解く', () => {
  it('形の揃った字を、そのまま選びにする', () => {
    expect(parseTabSelection(JSON.stringify(SELECTION))).toEqual(SELECTION);
  });

  it('字が壊れていれば読まない', () => {
    expect(
      parseTabSelection('{"version": 1,'),
      '壊れた覚え書きで投げると、観測ごと止まる。読めるものが無い、として返す',
    ).toBeUndefined();
    expect(parseTabSelection('')).toBeUndefined();
  });

  it('記録でないものは読まない', () => {
    expect(parseTabSelection('null')).toBeUndefined();
    expect(parseTabSelection('[]'), '並びは選びではない').toBeUndefined();
    expect(parseTabSelection('"pinned"')).toBeUndefined();
  });

  it('版が違えば読まない', () => {
    const other = JSON.stringify({ ...SELECTION, version: 2 });
    expect(other, '前提を確かめる').toContain('"version":2');
    expect(
      parseTabSelection(other),
      '移行も復旧も持たない。読めない版は捨てて、選び直してもらう',
    ).toBeUndefined();
    expect(parseTabSelection(JSON.stringify({ ...SELECTION, version: '1' }))).toBeUndefined();
  });

  it('欄の型が違えば読まない', () => {
    expect(
      parseTabSelection(JSON.stringify({ ...SELECTION, pinned: '-w-alpha' })),
      '字ひとつを並びと読み違えると、以降の導出が壊れた前提で走る',
    ).toBeUndefined();
    expect(
      parseTabSelection(JSON.stringify({ ...SELECTION, pinned: ['-w-alpha', 7] })),
      '1 つでも字でなければ、並びごと捨てる',
    ).toBeUndefined();
    expect(parseTabSelection(JSON.stringify({ ...SELECTION, hidden: null }))).toBeUndefined();
    expect(parseTabSelection(JSON.stringify({ ...SELECTION, mode: 'すべて' }))).toBeUndefined();
  });

  it('欄が足りなければ読まない', () => {
    expect(parseTabSelection(JSON.stringify({ version: 1, mode: 'all' }))).toBeUndefined();
  });

  it('土台へ細工する欄を持ち込ませない', () => {
    const parsed = parseTabSelection(
      '{"version":1,"mode":"all","pinned":[],"hidden":[],"__proto__":{"polluted":"yes"}}',
    );

    expect(parsed, '形が揃ってはいるので、読めること自体は変わらない').toEqual(
      DEFAULT_TAB_SELECTION,
    );
    expect(
      ({} as Record<string, unknown>).polluted,
      '覚え書きの字が土台を書き換えると、読んだ後のあらゆる記録に細工が乗る',
    ).toBeUndefined();
    expect(
      Object.keys(parsed as object),
      '読めた分だけを組み直す。字をそのまま広げると、この欄が乗ったまま持ち回される',
    ).toEqual(['version', 'mode', 'pinned', 'hidden']);
  });

  it('土台に生えた欄を、覚え書きの欄として読まない', () => {
    const base = Object.prototype as unknown as Record<string, unknown>;
    base.version = 1;
    base.mode = 'pinned';
    base.pinned = ['-w-土台'];
    base.hidden = [];
    try {
      expect(
        parseTabSelection('{}'),
        '素の索きで読むと、欄の無い覚え書きが揃って見え、書いた覚えのない選びが読める',
      ).toBeUndefined();
      expect(
        parseTabSelection('{"version":1,"mode":"all","hidden":[]}'),
        '欠けた欄だけが土台から埋まると、置いた覚えのない id が留めたものとして並ぶ',
      ).toBeUndefined();
    } finally {
      for (const key of ['version', 'mode', 'pinned', 'hidden']) delete base[key];
    }
  });

  it('深く入れ子にした字でも、投げずに読めないと返す', () => {
    let deep = '1';
    for (let i = 0; i < 60_000; i++) deep = `[${deep}]`;

    expect(
      parseTabSelection(`{"version":1,"mode":"all","pinned":${deep},"hidden":[]}`),
      '読み解きが投げると、覚え書きを置かれただけで観測ごと止まる',
    ).toBeUndefined();
  });
});

describe('覚え書きの字にする', () => {
  it('書いて読み直すと同じものが返る', () => {
    const written = serializeTabSelection(SELECTION);
    expect(parseTabSelection(written)).toEqual(SELECTION);
  });

  it('既定も同じように往復する', () => {
    expect(parseTabSelection(serializeTabSelection(DEFAULT_TAB_SELECTION))).toEqual(
      DEFAULT_TAB_SELECTION,
    );
  });

  it('知らない欄は持ち越さない', () => {
    const written = serializeTabSelection({
      ...SELECTION,
      extra: 'x',
    } as TabSelection);
    expect(
      Object.keys(JSON.parse(written)),
      '欄を持ち越すと、覚え書きが少しずつ知らないものを抱える',
    ).toEqual(['version', 'mode', 'pinned', 'hidden']);
  });
});
