import { describe, expect, it } from 'vitest';
import {
  parsePreferencesDocument,
  serializePreferencesDocument,
} from '~/domain/value-objects/workspace/preferences-document.value-object.ts';
import {
  DEFAULT_TAB_SELECTION,
  type TabSelection,
} from '~/domain/value-objects/workspace/tab-selection.value-object.ts';

/* `preferences.json` には人が選んだものが 2 つ入っている。

   **片方の壊れ方を、もう片方に及ぼさない。** 1 つのパースで両方を読むと、`pinned` の
   1 要素が壊れているだけで選んだ言葉まで消える。 */

const SELECTION: TabSelection = {
  version: 1,
  mode: 'pinned',
  pinned: ['-w-alpha', '-w-beta'],
  hidden: ['-w-noise'],
};

describe('置いたテキストは、そのまま読み直せる', () => {
  it('選択と言葉を、どちらも往復する', () => {
    const written = serializePreferencesDocument({ selection: SELECTION, locale: 'ja' });

    expect(parsePreferencesDocument(written)).toEqual({ selection: SELECTION, locale: 'ja' });
  });

  it('既定も同じように往復する', () => {
    const written = serializePreferencesDocument({
      selection: DEFAULT_TAB_SELECTION,
      locale: null,
    });

    expect(parsePreferencesDocument(written)).toEqual({
      selection: DEFAULT_TAB_SELECTION,
      locale: undefined,
    });
  });

  /* 欄ごと落とすと、次に読んだ人には「この `preferences.json` には言葉の欄が無い」と
     「まだ選んでいない」が同じ顔で見える。 */
  it('まだ選んでいない言葉も、欄としては置く', () => {
    const written = serializePreferencesDocument({
      selection: DEFAULT_TAB_SELECTION,
      locale: null,
    });

    expect(Object.keys(JSON.parse(written))).toEqual([
      'version',
      'mode',
      'pinned',
      'hidden',
      'locale',
    ]);
  });

  it('知らない欄は持ち越さない', () => {
    const written = serializePreferencesDocument({
      selection: { ...SELECTION, extra: 'x' } as TabSelection,
      locale: null,
    });

    expect(
      Object.keys(JSON.parse(written)),
      '欄を持ち越すと、`preferences.json` が少しずつ知らないものを抱える',
    ).toEqual(['version', 'mode', 'pinned', 'hidden', 'locale']);
  });
});

describe('片方が読めなくても、もう片方は読める', () => {
  it('タブの選択が壊れていても、選んだ言葉は残る', () => {
    const document = parsePreferencesDocument(
      '{"version":1,"mode":"all","pinned":"-w-a","hidden":[],"locale":"ko"}',
    );

    expect(document.selection).toBeUndefined();
    expect(document.locale, 'ピン留めの壊れ方が、選んだ言葉を巻き添えにしている').toBe('ko');
  });

  it('言葉が読めなくても、タブの選択は残る', () => {
    const document = parsePreferencesDocument(
      '{"version":1,"mode":"all","pinned":["-w-a"],"hidden":[],"locale":"クリンゴン語"}',
    );

    expect(document.locale).toBeUndefined();
    expect(document.selection?.pinned, '知らない綴りが、留めたタブを巻き添えにしている').toEqual([
      '-w-a',
    ]);
  });

  it('壊れたテキストは、どちらも読めないと返す', () => {
    expect(parsePreferencesDocument('{"version": 1,')).toEqual({
      selection: undefined,
      locale: undefined,
    });
  });

  /* 素のプロパティ参照はプロトタイプまで拾う。`__proto__` を通して欄が生えていると、
     書いた覚えのない言葉が読めてしまう。 */
  it('プロトタイプから来た言葉は、選んだ言葉ではない', () => {
    const document = parsePreferencesDocument('{"__proto__":{"locale":"ja"}}');

    expect(document.locale).toBeUndefined();
  });
});
