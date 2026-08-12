import { describe, expect, it } from 'vitest';
import {
  parsePreferencesDocument,
  serializePreferencesDocument,
} from '~/domain/value-objects/workspace/preferences-document.value-object.ts';
import {
  DEFAULT_WATCHED_PROJECTS,
  type WatchedProjects,
} from '~/domain/value-objects/workspace/watched-projects.value-object.ts';

/* `preferences.json` には人が決めたものが 2 つ入っている。

   **片方の壊れ方を、もう片方に及ぼさない。** 1 つのパースで両方を読むと、`watched` の
   1 要素が壊れているだけで選んだ言葉まで消える。 */

const WATCHED: WatchedProjects = { version: 2, paths: ['/w/alpha', '/w/beta'] };

/** 1 つ前の形からは、留めてあった id だけを持ち出す。読み替えるのは観測の側である */
const EMPTY_LEGACY = { pinnedIds: undefined };

describe('置いたテキストは、そのまま読み直せる', () => {
  it('記録と言葉を、どちらも往復する', () => {
    const written = serializePreferencesDocument({ watched: WATCHED, locale: 'ja' });

    expect(parsePreferencesDocument(written)).toEqual({
      watched: WATCHED,
      locale: 'ja',
      ...EMPTY_LEGACY,
    });
  });

  it('既定も同じように往復する', () => {
    const written = serializePreferencesDocument({
      watched: DEFAULT_WATCHED_PROJECTS,
      locale: null,
    });

    expect(parsePreferencesDocument(written)).toEqual({
      watched: DEFAULT_WATCHED_PROJECTS,
      locale: undefined,
      ...EMPTY_LEGACY,
    });
  });

  /* 欄ごと落とすと、次に読んだ人には「この `preferences.json` には言葉の欄が無い」と
     「まだ選んでいない」が同じ顔で見える。 */
  it('まだ選んでいない言葉も、欄としては置く', () => {
    const written = serializePreferencesDocument({
      watched: DEFAULT_WATCHED_PROJECTS,
      locale: null,
    });

    expect(Object.keys(JSON.parse(written))).toEqual(['version', 'watched', 'locale']);
  });

  it('知らない欄は持ち越さない', () => {
    const written = serializePreferencesDocument({
      watched: { ...WATCHED, extra: 'x' } as WatchedProjects,
      locale: null,
    });

    expect(
      Object.keys(JSON.parse(written)),
      '欄を持ち越すと、`preferences.json` が少しずつ知らないものを抱える',
    ).toEqual(['version', 'watched', 'locale']);
  });
});

describe('片方が読めなくても、もう片方は読める', () => {
  it('記録が壊れていても、選んだ言葉は残る', () => {
    const document = parsePreferencesDocument('{"version":2,"watched":"/w/a","locale":"ko"}');

    expect(document.watched).toBeUndefined();
    expect(document.locale, '記録の壊れ方が、選んだ言葉を巻き添えにしている').toBe('ko');
  });

  it('言葉が読めなくても、記録は残る', () => {
    const document = parsePreferencesDocument(
      '{"version":2,"watched":["/w/a"],"locale":"クリンゴン語"}',
    );

    expect(document.locale).toBeUndefined();
    expect(document.watched?.paths, '知らない綴りが、記録を巻き添えにしている').toEqual(['/w/a']);
  });

  it('壊れたテキストは、どちらも読めないと返す', () => {
    expect(parsePreferencesDocument('{"version": 2,')).toEqual({
      watched: undefined,
      locale: undefined,
      ...EMPTY_LEGACY,
    });
  });

  /* 素のプロパティ参照はプロトタイプまで拾う。`__proto__` を通して欄が生えていると、
     書いた覚えのない言葉が読めてしまう。 */
  it('プロトタイプから来た言葉は、選んだ言葉ではない', () => {
    const document = parsePreferencesDocument('{"__proto__":{"locale":"ja"}}');

    expect(document.locale).toBeUndefined();
  });
});

/* 1 つ前の形も読む。**そこに書いてあるのは、その人が観ると決めたものそのものである** ——
   捨てると、更新した日に一覧が黙って空になる。 */
describe('1 つ前の形', () => {
  it('留めてあった id を持ち出す', () => {
    const document = parsePreferencesDocument(
      '{"version":1,"mode":"all","pinned":["-w-a"],"hidden":[],"locale":"ja"}',
    );

    expect(document.watched, '今の形としては読めない').toBeUndefined();
    expect(document.pinnedIds).toEqual(['-w-a']);
    expect(document.locale, '言葉の欄は、どちらの形でも同じ場所に在る').toBe('ja');
  });
});
