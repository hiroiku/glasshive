import { describe, expect, it } from 'vitest';
import {
  asArray,
  asInt,
  asRecord,
  asString,
  hasKey,
  parseFirstJsonLine,
  parseJsonlLines,
} from '~/app-kernel/json.ts';

describe('型の分からない値を覗く', () => {
  it('字の欄だけを字として返す', () => {
    expect(asString({ a: 'x' }, 'a')).toBe('x');
    expect(asString({ a: 1 }, 'a')).toBe(undefined);
    expect(asString({ a: null }, 'a')).toBe(undefined);
    expect(asString({}, 'a')).toBe(undefined);
  });

  it('記録でないものを覗いても壊れない', () => {
    expect(asString(null, 'a')).toBe(undefined);
    expect(asString(undefined, 'a')).toBe(undefined);
    expect(asString(5, 'a')).toBe(undefined);
    expect(asString(['x'], '0'), '並びは記録ではない').toBe(undefined);
  });

  it('入れ子の記録と並びを見分ける', () => {
    expect(asRecord({ m: { k: 1 } }, 'm')).toEqual({ k: 1 });
    expect(asRecord({ m: [1] }, 'm')).toBe(undefined);
    expect(asArray({ m: [1] }, 'm')).toEqual([1]);
    expect(asArray({ m: { k: 1 } }, 'm')).toBe(undefined);
  });

  it('欄があることと、値が入っていることを分ける', () => {
    expect(hasKey({ a: null }, 'a'), '値が空でも、欄そのものは在る').toBe(true);
    expect(hasKey({ a: undefined }, 'a')).toBe(false);
    expect(hasKey({}, 'a')).toBe(false);
  });

  it('数として読めない欄は 0 と数える', () => {
    expect(asInt({ n: 12 }, 'n')).toBe(12);
    expect(asInt({ n: 12.9 }, 'n')).toBe(12);
    expect(asInt({ n: '12' }, 'n')).toBe(0);
    expect(asInt({ n: Number.NaN }, 'n')).toBe(0);
    expect(asInt({}, 'n')).toBe(0);
  });
});

describe('行ごとの読み解き', () => {
  it('記録として読めた行だけを流す', () => {
    const text = ['{"a":1}', '{"b":2}'].join('\n');
    expect([...parseJsonlLines(text)]).toEqual([{ a: 1 }, { b: 2 }]);
  });

  it('壊れた行は飛ばして、その先を読む', () => {
    const text = ['{"a":1}', '{壊れている', '{"b":2}'].join('\n');
    expect([...parseJsonlLines(text)], '1 行の壊れで観測ごと失うほうが大きな嘘になる').toEqual([
      { a: 1 },
      { b: 2 },
    ]);
  });

  it('記録でない行は流さない', () => {
    const text = ['5', '"x"', 'null', 'true', '[1,2]', '{"a":1}'].join('\n');
    expect([...parseJsonlLines(text)]).toEqual([{ a: 1 }]);
  });

  it('空の行を飛ばす', () => {
    expect([...parseJsonlLines('\n\n{"a":1}\n\n')]).toEqual([{ a: 1 }]);
    expect([...parseJsonlLines('')]).toEqual([]);
  });
});

describe('先頭の 1 行', () => {
  it('改行までを読む', () => {
    expect(parseFirstJsonLine('{"a":1}\n{"b":2}\n')).toEqual({ a: 1 });
  });

  it('改行が無ければ全部を 1 行と見る', () => {
    expect(parseFirstJsonLine('{"a":1}')).toEqual({ a: 1 });
  });

  it('読めない先頭は無いものとして返す', () => {
    expect(parseFirstJsonLine('{途中で切れて')).toBe(undefined);
    expect(parseFirstJsonLine('')).toBe(undefined);
    expect(parseFirstJsonLine('\n{"a":1}')).toBe(undefined);
  });
});
