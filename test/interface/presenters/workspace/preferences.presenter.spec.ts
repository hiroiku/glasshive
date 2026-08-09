import { describe, expect, it } from 'vitest';
import { AppError } from '~/app-kernel/error.ts';
import { absent, observed, unobservable } from '~/app-kernel/observation.ts';
import { presentPreferences } from '~/interface/presenters/workspace/preferences.presenter.ts';

class StoreError extends AppError {
  readonly code = 'preferences.unreadable';
}

/* 写す元の形は、写す役が受け取る形から取る。**字を書き写すと、検査が形を写しただけになる。**
   出力の形が変わった瞬間にここが落ちて、写し忘れに気づける。 */
type View = Parameters<typeof presentPreferences>[0];

const DEFAULT: View['selection'] = {
  version: 1,
  mode: 'all',
  pinned: [],
  hidden: [],
};

const view = (parts: Partial<View>): View => ({
  selection: DEFAULT,
  visibleTabs: [],
  stored: observed(DEFAULT),
  ...parts,
});

describe('選びを外の道の形へ写す', () => {
  it('覚えている選びと、出す対象を別々に出す', () => {
    const presented = presentPreferences(
      view({
        selection: {
          version: 1,
          mode: 'pinned',
          pinned: ['-w-a', '-w-gone'],
          hidden: ['-w-n'],
        },
        visibleTabs: ['-w-a'],
      }),
    );

    expect(presented.tab_selection).toEqual({
      version: 1,
      mode: 'pinned',
      pinned: ['-w-a', '-w-gone'],
      hidden: ['-w-n'],
    });
    expect(
      presented.visible_tabs,
      '出す対象は留めたものの写しではない。両方出さないと、留めてあるのにタブが無い理由が見えない',
    ).toEqual(['-w-a']);
  });

  it('覚え書きをどう読めたかを添える', () => {
    expect(presentPreferences(view({})).stored).toEqual({
      state: 'observed',
      reason: null,
    });
    expect(
      presentPreferences(view({ stored: absent('no-source') })).stored,
      'まだ選んでいないのと、読めなかったのは別の事実である',
    ).toEqual({ state: 'absent', reason: 'no-source' });
    expect(
      presentPreferences(view({ stored: unobservable(new StoreError('読めない')) })).stored,
      '読めなかったときは、どの誤りかを名札で言う',
    ).toEqual({ state: 'unobservable', reason: 'preferences.unreadable' });
  });

  it('外へ出す欄はこの 3 つだけ', () => {
    expect(
      Object.keys(presentPreferences(view({}))),
      '欄を足すと、受け取る側が形を二通り覚えることになる',
    ).toEqual(['tab_selection', 'visible_tabs', 'stored']);
  });
});
