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

describe('`preferences.json` のテキストをタブの選択として読む', () => {
  it('タブの選択として読めるテキストは、そのまま選択になる', () => {
    expect(selectionOf(observed(JSON.stringify(SELECTION)))).toEqual({
      kind: 'observed',
      value: SELECTION,
    });
  });

  it('テキストが壊れていれば、読めるものが無いこととして返す', () => {
    expect(
      selectionOf(observed('{"version": 1,')),
      '`preferences.json` が壊れていても、例外で観測ごと止めてはいけない',
    ).toEqual({ kind: 'absent', reason: 'empty' });
  });

  it('バージョンが違えば、読めるものが無いこととして返す', () => {
    const other = JSON.stringify({
      version: 2,
      mode: 'all',
      pinned: [],
      hidden: [],
    });
    expect(
      selectionOf(observed(other)),
      '移行も復旧も持たない。読めないバージョンはここで捨てる',
    ).toEqual({
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

  it('空のテキストも、読めるものが無いこととして返す', () => {
    expect(selectionOf(observed(''))).toEqual({
      kind: 'absent',
      reason: 'empty',
    });
  });

  it('プロトタイプから生えた欄を、`preferences.json` の欄として読まない', () => {
    const forged = '{"__proto__":{"version":1,"mode":"all","pinned":[],"hidden":[]}}';
    expect(
      selectionOf(observed(forged)),
      'プロトタイプに欄が生えていると、書いた覚えのない選択が読めてしまう',
    ).toEqual({ kind: 'absent', reason: 'empty' });
  });

  it('まだ無いことは、まだ無いまま通す', () => {
    expect(
      selectionOf(absent('no-source')),
      'まだ一度も選んでいないのは、読めなかったことではない',
    ).toEqual({ kind: 'absent', reason: 'no-source' });
  });

  it('観測できなかったことは、倒さずに通す', () => {
    const failure = unobservable(new StoreError('読めない'));
    expect(
      selectionOf(failure),
      '倒すのと通すのを混ぜると、既定へ倒れた理由がユーザーから見えなくなる',
    ).toBe(failure);
  });
});

describe('タブの選択を `preferences.json` のテキストにする', () => {
  it('置いたテキストは、そのまま読み直せる', () => {
    expect(
      selectionOf(observed(documentOf(SELECTION))),
      '置いた形と読める形が離れると、置いた直後に選択が消える',
    ).toEqual({ kind: 'observed', value: SELECTION });
  });
});
