import { describe, expect, it } from 'vitest';
import { format } from '~/interface/i18n/message.ts';

/* 文の組み立て。差し込みは `{name}` と、数に合わせて言い分ける
   `{name, plural, one {…} other {…}}` の 2 つだけを読む。 */

describe('値を差し込む', () => {
  it('名前のところへ値を置く', () => {
    expect(format('{n} of {total} transcripts read', 'en', { n: 8, total: 40 })).toBe(
      '8 of 40 transcripts read',
    );
  });

  it('同じ名前が何度出てきても、そのつど置く', () => {
    expect(format('{name} → {name}', 'en', { name: 'a' })).toBe('a → a');
  });

  /* 消すと、渡し忘れた差し込みが「そういう文だった」ように読めてしまう。 */
  it('渡していない名前は、書いたまま残す', () => {
    expect(format('{n} of {total}', 'en', { n: 8 })).toBe('8 of {total}');
  });

  it('差し込みの無い文は、そのまま出る', () => {
    expect(format('Search agents and transcripts…', 'ja')).toBe('Search agents and transcripts…');
  });

  /* 観測したテキストには `{` が普通に出てくる。読み違えて消すと、観測を書き換えることになる。 */
  it('差し込みでない波括弧は、触らない', () => {
    const observedText = '{"errors":[{"message":"Bad credentials"}]}';

    expect(format(observedText, 'en')).toBe(observedText);
  });

  it('閉じていない波括弧でも、出せるところまで出す', () => {
    expect(format('read {n of', 'en', { n: 3 })).toBe('read {n of');
  });

  it('数は、その言葉の桁の区切りに通す', () => {
    expect(format('{n}', 'en', { n: 1234567 })).toBe('1,234,567');
    expect(format('{n}', 'ja', { n: 1234567 })).toBe('1,234,567');
  });
});

/* 数の言い分けは自分で数えない。`Intl.PluralRules` が言葉ごとの決まりを知っている。 */
describe('数に合わせて言い分ける', () => {
  const source = '{n, plural, one {# message} other {# messages}}';

  it('英語は 1 のときだけ別の形になる', () => {
    expect(format(source, 'en', { n: 1 })).toBe('1 message');
    expect(format(source, 'en', { n: 0 })).toBe('0 messages');
    expect(format(source, 'en', { n: 12 })).toBe('12 messages');
  });

  it('言い分けの無い言葉では、`other` だけが出る', () => {
    expect(format('{n, plural, one {# 件} other {# 件}}', 'ja', { n: 1 })).toBe('1 件');
  });

  it('`#` はその分岐が語っている数そのものである', () => {
    expect(format('{n, plural, other {read # of them}}', 'en', { n: 3 })).toBe('read 3 of them');
  });

  it('分岐の中の差し込みも、そのまま置く', () => {
    expect(
      format('{n, plural, one {# of {total}} other {# of {total}}}', 'en', { n: 2, total: 9 }),
    ).toBe('2 of 9');
  });

  /* 綴り間違いで画面を消さない。出せるところまで出す。 */
  it('その言葉にある分類を持っていなければ、`other` へ倒す', () => {
    expect(format('{n, plural, other {# left}}', 'en', { n: 1 })).toBe('1 left');
  });

  it('名前に `plural` を含んでいても、分岐の始まりを見失わない', () => {
    expect(format('{pluralCount, plural, one {# x} other {# xs}}', 'en', { pluralCount: 1 })).toBe(
      '1 x',
    );
  });
});
