import { describe, expect, it } from 'vitest';
import { AppError } from '~/app-kernel/error.ts';
import { absent, observed, unobservable } from '~/app-kernel/observation.ts';
import {
  documentOf,
  selectionOf,
} from '~/application/services/workspace/preferences-document.service.ts';

class StoreError extends AppError {
  readonly code = 'preferences.unreadable';
}

const SELECTION = {
  version: 1,
  mode: 'pinned',
  pinned: ['-w-alpha', '-w-beta'],
  hidden: ['-w-noise'],
} as const;

describe('覚え書きの字を選びとして読む', () => {
  it('選びとして読める字は、そのまま選びになる', () => {
    expect(selectionOf(observed(JSON.stringify(SELECTION)))).toEqual({
      kind: 'observed',
      value: SELECTION,
    });
  });

  it('字が壊れていれば、読めるものが無いこととして返す', () => {
    expect(
      selectionOf(observed('{"version": 1,')),
      '壊れた覚え書きで投げると、観測ごと止まる。覚え書きが壊れても観測は止まらない',
    ).toEqual({ kind: 'absent', reason: 'empty' });
  });

  it('版が違えば、読めるものが無いこととして返す', () => {
    const other = JSON.stringify({
      version: 2,
      mode: 'all',
      pinned: [],
      hidden: [],
    });
    expect(selectionOf(observed(other)), '移行も復旧も持たない。読めない版はここで捨てる').toEqual({
      kind: 'absent',
      reason: 'empty',
    });
  });

  it('欄の型が違えば、読めるものが無いこととして返す', () => {
    const wrong = JSON.stringify({
      version: 1,
      mode: 'all',
      pinned: '-w-alpha',
      hidden: [],
    });
    expect(selectionOf(observed(wrong))).toEqual({
      kind: 'absent',
      reason: 'empty',
    });
  });

  it('空の字も、読めるものが無いこととして返す', () => {
    expect(selectionOf(observed(''))).toEqual({
      kind: 'absent',
      reason: 'empty',
    });
  });

  it('土台から生えた欄を、覚え書きの欄として読まない', () => {
    const forged = '{"__proto__":{"version":1,"mode":"all","pinned":[],"hidden":[]}}';
    expect(
      selectionOf(observed(forged)),
      '土台に欄が生えていると、書いた覚えのない選びが読めてしまう',
    ).toEqual({ kind: 'absent', reason: 'empty' });
  });

  it('まだ無いことは、まだ無いまま通す', () => {
    expect(
      selectionOf(absent('no-source')),
      'まだ一度も選んでいないのは、読めなかったことではない',
    ).toEqual({ kind: 'absent', reason: 'no-source' });
  });

  it('見に行けなかったことは、倒さずに通す', () => {
    const failure = unobservable(new StoreError('読めない'));
    expect(
      selectionOf(failure),
      '倒すのと通すのを混ぜると、既定へ倒れた理由が観る人から見えなくなる',
    ).toBe(failure);
  });
});

describe('選びを覚え書きの字にする', () => {
  it('置いた字は、そのまま読み直せる', () => {
    expect(
      selectionOf(observed(documentOf(SELECTION))),
      '置いた形と読める形が離れると、置いた直後に選びが消える',
    ).toEqual({ kind: 'observed', value: SELECTION });
  });
});
