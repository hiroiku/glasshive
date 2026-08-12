import { describe, expect, it } from 'vitest';
import { AppError } from '~/app-kernel/error.ts';
import { absent, observed, unobservable } from '~/app-kernel/observation.ts';
import {
  documentOf,
  localeOf,
  watchedOf,
} from '~/application/services/workspace/preferences-document.service.ts';

class StoreError extends AppError {
  readonly code = 'preferences.unreadable';
}

const WATCHED = { version: 2, paths: ['/w/alpha', '/w/beta'] } as const;

const document = { version: 2, watched: ['/w/alpha', '/w/beta'] };

describe('`preferences.json` のテキストを記録として読む', () => {
  it('記録として読めるテキストは、そのまま記録になる', () => {
    expect(watchedOf(observed(JSON.stringify(document)))).toEqual({
      kind: 'observed',
      value: WATCHED,
    });
  });

  it('テキストが壊れていれば、読めるものが無いこととして返す', () => {
    expect(
      watchedOf(observed('{"version": 2,')),
      '`preferences.json` が壊れていても、例外で観測ごと止めてはいけない',
    ).toEqual({ kind: 'absent', reason: 'empty' });
  });

  it('知らないバージョンは、読めるものが無いこととして返す', () => {
    const other = JSON.stringify({ version: 9, watched: [] });
    expect(watchedOf(observed(other)), '読めないバージョンはここで捨てる').toEqual({
      kind: 'absent',
      reason: 'empty',
    });
  });

  it('欄の型が違えば、読めるものが無いこととして返す', () => {
    const wrong = JSON.stringify({ version: 2, watched: '/w/alpha' });
    expect(watchedOf(observed(wrong))).toEqual({
      kind: 'absent',
      reason: 'empty',
    });
  });

  it('空のテキストも、読めるものが無いこととして返す', () => {
    expect(watchedOf(observed(''))).toEqual({
      kind: 'absent',
      reason: 'empty',
    });
  });

  it('プロトタイプから生えた欄を、`preferences.json` の欄として読まない', () => {
    const forged = '{"__proto__":{"version":2,"watched":["/w/a"]}}';
    expect(
      watchedOf(observed(forged)),
      'プロトタイプに欄が生えていると、書いた覚えのない記録が読めてしまう',
    ).toEqual({ kind: 'absent', reason: 'empty' });
  });

  /* 1 つ前の形は、留めてあった id しか持っていない。id からパスは決まらないので、
     見つけたものの中に同じ id が居るときだけ読み替えられる。 */
  it('1 つ前の形は、見つけたもののパスへ読み替えて引き継ぐ', () => {
    const legacy = JSON.stringify({ version: 1, mode: 'all', pinned: ['-w-a', '-w-gone'] });

    expect(
      watchedOf(observed(legacy), [{ id: '-w-a', path: '/w/a' }]),
      '捨てると、更新した日に一覧が黙って空になる',
    ).toEqual({ kind: 'observed', value: { version: 2, paths: ['/w/a'] } });
  });

  it('まだ無いことは、まだ無いまま通す', () => {
    expect(
      watchedOf(absent('no-source')),
      'まだ一度も決めていないのは、読めなかったことではない',
    ).toEqual({ kind: 'absent', reason: 'no-source' });
  });

  it('観測できなかったことは、倒さずに通す', () => {
    const failure = unobservable(new StoreError('読めない'));
    expect(
      watchedOf(failure),
      '倒すのと通すのを混ぜると、既定へ倒れた理由がユーザーから見えなくなる',
    ).toBe(failure);
  });
});

describe('記録を `preferences.json` のテキストにする', () => {
  it('置いたテキストは、そのまま読み直せる', () => {
    expect(
      watchedOf(observed(documentOf(WATCHED, null))),
      '置いた形と読める形が離れると、置いた直後に記録が消える',
    ).toEqual({ kind: 'observed', value: WATCHED });
  });
});

/* 選ばれた画面の言葉。**まだ選んでいないことと、観測できなかったことを分ける** ——
   前者はブラウザーが名乗る言葉へ倒してよく、後者は倒した結果を「その人が選んだ」と
   名乗ってはいけない。 */
describe('`preferences.json` のテキストから、選ばれた言葉を読む', () => {
  it('出せる綴りは、そのまま言葉になる', () => {
    expect(localeOf(observed('{"locale":"zh-Hans"}'))).toEqual({
      kind: 'observed',
      value: 'zh-Hans',
    });
  });

  it('欄が無ければ、まだ選んでいないこととして返す', () => {
    expect(localeOf(observed(JSON.stringify(document)))).toEqual({
      kind: 'absent',
      reason: 'empty',
    });
  });

  it('知らない綴りは、選ばれていないことにする', () => {
    expect(
      localeOf(observed('{"locale":"クリンゴン語"}')),
      '知らない綴りを通すと、英語のまま出ている画面がその言葉を名乗る',
    ).toEqual({ kind: 'absent', reason: 'empty' });
  });

  it('観測できなかったことは、倒さずに通す', () => {
    const failure = unobservable(new StoreError('読めない'));

    expect(localeOf(failure)).toBe(failure);
  });

  /* 1 つのパースで両方を読むと、片方の壊れ方がもう片方を巻き添えにする。 */
  it('記録が壊れていても、言葉は読める', () => {
    expect(
      localeOf(observed('{"version":2,"watched":"/w/a","locale":"ko"}')),
      '記録の壊れ方が、選んだ言葉を巻き添えにしている',
    ).toEqual({ kind: 'observed', value: 'ko' });
  });
});
