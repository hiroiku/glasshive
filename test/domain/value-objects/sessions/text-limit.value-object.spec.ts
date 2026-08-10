import { describe, expect, it } from 'vitest';
import {
  ELLIPSIS,
  truncateChars,
} from '~/domain/value-objects/sessions/text-limit.value-object.ts';

describe('導き出した言葉の切り詰め', () => {
  it('上限までは手を加えない', () => {
    expect(truncateChars('abcde', 5)).toBe('abcde');
    expect(truncateChars('abc', 5)).toBe('abc');
  });

  it('上限を超えたら切り詰めて省略記号を添える', () => {
    expect(truncateChars('abcdef', 5)).toBe(`abcde${ELLIPSIS}`);
  });

  it('2 単位で 1 文字を成す絵文字を割らない', () => {
    // UTF-16 の長さで切ると、ここで代理対が割れて壊れた文字が出る
    expect(truncateChars('🍎🍏🍊', 2)).toBe(`🍎🍏${ELLIPSIS}`);
    expect(truncateChars('🍎🍏🍊', 3)).toBe('🍎🍏🍊');
  });

  it('空の言葉はそのまま', () => {
    expect(truncateChars('', 5)).toBe('');
  });
});
