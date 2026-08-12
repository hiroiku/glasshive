import { describe, expect, it } from 'vitest';
import {
  DEFAULT_LOCALE,
  isLocale,
  LOCALES,
} from '~/domain/value-objects/workspace/locale.value-object.ts';

/* 画面に出せる言葉。一覧が閉じているのは、同梱したカタログとフォントの範囲が、
   そのまま出せる範囲だからである。 */

describe('出せる言葉かどうかを見分ける', () => {
  it('一覧に在る綴りだけを受ける', () => {
    for (const locale of LOCALES) expect(isLocale(locale)).toBe(true);
  });

  /* 受けてしまうと、英語のまま出ている画面が「その言葉で出している」と名乗ることになる。 */
  it('知らない綴りは受けない', () => {
    expect(isLocale('ja-JP'), '出せるのは寄せた後の綴りだけである').toBe(false);
    expect(isLocale('zh')).toBe(false);
    expect(isLocale('')).toBe(false);
    expect(isLocale(null)).toBe(false);
    expect(isLocale(['ja'])).toBe(false);
  });

  it('既定は書いた言葉そのものである', () => {
    expect(DEFAULT_LOCALE, '翻訳の元が英語なので、読めない選択はここへ倒す').toBe('en');
    expect(LOCALES).toContain(DEFAULT_LOCALE);
  });
});
