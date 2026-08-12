import { describe, expect, it } from 'vitest';
import { LOCALE_NAMES, LOCALES, negotiateLocale } from '~/interface/i18n/locale.ts';

/* ブラウザーが名乗るタグを、出せる言葉へ寄せる。 */

describe('ブラウザーが名乗る言葉から選ぶ', () => {
  it('地域まで付いたタグを、出せる綴りへ寄せる', () => {
    expect(negotiateLocale(['ja-JP'])).toBe('ja');
    expect(negotiateLocale(['ko-KR'])).toBe('ko');
    expect(negotiateLocale(['en-GB'])).toBe('en');
  });

  /* `zh-TW` には書き分け(`Hant`)が書かれていないのに、簡体字で出すと読み手にとっては
     別の文字である。 */
  it('中国語は、地域から書き分けを決める', () => {
    expect(negotiateLocale(['zh-TW'])).toBe('zh-Hant');
    expect(negotiateLocale(['zh-HK'])).toBe('zh-Hant');
    expect(negotiateLocale(['zh-MO'])).toBe('zh-Hant');
    expect(negotiateLocale(['zh-CN'])).toBe('zh-Hans');
    expect(negotiateLocale(['zh-SG'])).toBe('zh-Hans');
    expect(negotiateLocale(['zh']), '地域が無ければ簡体字に倒す').toBe('zh-Hans');
  });

  it('書き分けが直に書いてあれば、地域より強い', () => {
    expect(negotiateLocale(['zh-Hant-CN']), '繁体字と書いた人は繁体字を求めている').toBe('zh-Hant');
    expect(negotiateLocale(['zh-Hans-TW'])).toBe('zh-Hans');
  });

  it('綴りの大小を問わない', () => {
    expect(negotiateLocale(['ZH-HANT-TW'])).toBe('zh-Hant');
    expect(negotiateLocale(['JA'])).toBe('ja');
  });

  /* 止めてしまうと、`['fr-FR', 'ja']` と名乗る人に英語を出すことになる。 */
  it('寄せられないタグは飛ばして、次を見る', () => {
    expect(negotiateLocale(['fr-FR', 'de', 'ja-JP'])).toBe('ja');
  });

  it('どれも寄せられなければ、書いた言葉そのものへ倒す', () => {
    expect(negotiateLocale(['fr-FR', 'de'])).toBe('en');
    expect(negotiateLocale([])).toBe('en');
  });
});

/* 読めない言葉の一覧から自分の言葉を探すことになるのは、いま英語しか読めない画面に居る人である。 */
describe('選ぶための名前', () => {
  it('出せる言葉すべてに名前が在る', () => {
    expect(Object.keys(LOCALE_NAMES).sort()).toEqual([...LOCALES].sort());
  });

  it('名前はその言葉自身で書く', () => {
    expect(LOCALE_NAMES.ja).toBe('日本語');
    expect(LOCALE_NAMES.ko).toBe('한국어');
    expect(LOCALE_NAMES['zh-Hans']).toBe('简体中文');
    expect(LOCALE_NAMES['zh-Hant']).toBe('繁體中文');
  });
});
