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

describe('`preferences.json` のテキストをパースする', () => {
  it('形の揃ったテキストを、そのままタブの選択にする', () => {
    expect(parseTabSelection(JSON.stringify(SELECTION))).toEqual(SELECTION);
  });

  it('テキストが壊れていれば読まない', () => {
    expect(
      parseTabSelection('{"version": 1,'),
      '壊れた `preferences.json` で例外を投げると、観測ごと止まる。読めるものが無い、として返す',
    ).toBeUndefined();
    expect(parseTabSelection('')).toBeUndefined();
  });

  it('記録でないものは読まない', () => {
    expect(parseTabSelection('null')).toBeUndefined();
    expect(parseTabSelection('[]'), '配列はタブの選択ではない').toBeUndefined();
    expect(parseTabSelection('"pinned"')).toBeUndefined();
  });

  it('バージョンが違えば読まない', () => {
    const other = JSON.stringify({ ...SELECTION, version: 2 });
    expect(other, '前提を確かめる').toContain('"version":2');
    expect(
      parseTabSelection(other),
      '移行も復旧も持たない。読めないバージョンは捨てて、選び直してもらう',
    ).toBeUndefined();
    expect(parseTabSelection(JSON.stringify({ ...SELECTION, version: '1' }))).toBeUndefined();
  });

  it('欄の型が違えば読まない', () => {
    expect(
      parseTabSelection(JSON.stringify({ ...SELECTION, pinned: '-w-alpha' })),
      '文字列ひとつを配列と読み違えると、以降の導出が壊れた前提で走る',
    ).toBeUndefined();
    expect(
      parseTabSelection(JSON.stringify({ ...SELECTION, pinned: ['-w-alpha', 7] })),
      '1 つでも文字列でなければ、配列ごと捨てる',
    ).toBeUndefined();
    expect(parseTabSelection(JSON.stringify({ ...SELECTION, hidden: null }))).toBeUndefined();
    expect(parseTabSelection(JSON.stringify({ ...SELECTION, mode: 'すべて' }))).toBeUndefined();
  });

  it('欄が足りなければ読まない', () => {
    expect(parseTabSelection(JSON.stringify({ version: 1, mode: 'all' }))).toBeUndefined();
  });

  it('プロトタイプへ細工する欄を持ち込ませない', () => {
    const parsed = parseTabSelection(
      '{"version":1,"mode":"all","pinned":[],"hidden":[],"__proto__":{"polluted":"yes"}}',
    );

    expect(parsed, '形が揃ってはいるので、読めること自体は変わらない').toEqual(
      DEFAULT_TAB_SELECTION,
    );
    expect(
      ({} as Record<string, unknown>).polluted,
      '`preferences.json` のテキストがプロトタイプを書き換えると、読んだ後のあらゆる記録に細工が乗る',
    ).toBeUndefined();
    expect(
      Object.keys(parsed as object),
      '読めた分だけを組み直す。パースした値をそのまま広げると、この欄が乗ったまま持ち回される',
    ).toEqual(['version', 'mode', 'pinned', 'hidden']);
  });

  it('プロトタイプに生えた欄を、`preferences.json` の欄として読まない', () => {
    const base = Object.prototype as unknown as Record<string, unknown>;
    base.version = 1;
    base.mode = 'pinned';
    base.pinned = ['-w-土台'];
    base.hidden = [];
    try {
      expect(
        parseTabSelection('{}'),
        '素のプロパティ参照で読むと、欄の無い設定が揃って見え、書いた覚えのない選択が読める',
      ).toBeUndefined();
      expect(
        parseTabSelection('{"version":1,"mode":"all","hidden":[]}'),
        '欠けた欄だけがプロトタイプから埋まると、置いた覚えのない id がピン留めとして並ぶ',
      ).toBeUndefined();
    } finally {
      for (const key of ['version', 'mode', 'pinned', 'hidden']) delete base[key];
    }
  });

  it('深く入れ子にしたテキストでも、例外を投げずに読めないと返す', () => {
    let deep = '1';
    for (let i = 0; i < 60_000; i++) deep = `[${deep}]`;

    expect(
      parseTabSelection(`{"version":1,"mode":"all","pinned":${deep},"hidden":[]}`),
      'パースが例外を投げると、`preferences.json` を置かれただけで観測ごと止まる',
    ).toBeUndefined();
  });
});

describe('`preferences.json` のテキストにする', () => {
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
      '欄を持ち越すと、`preferences.json` が少しずつ知らないものを抱える',
    ).toEqual(['version', 'mode', 'pinned', 'hidden']);
  });
});
