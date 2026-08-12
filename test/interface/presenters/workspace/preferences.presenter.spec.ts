import { describe, expect, it } from 'vitest';
import { AppError } from '~/app-kernel/error.ts';
import { absent, observed, unobservable } from '~/app-kernel/observation.ts';
import { presentPreferences } from '~/interface/presenters/workspace/preferences.presenter.ts';

class StoreError extends AppError {
  readonly code = 'preferences.unreadable';
}

/* 変換元の形は、プレゼンターが受け取る形から取る。**型を書き写すと、テストが形のコピーになるだけである。**
   出力の形が変わった瞬間にここが落ちて、変換し忘れに気づける。 */
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
  locale: null,
  stored: observed(DEFAULT),
  ...parts,
});

describe('タブの選択を外部 API の形へ変換する', () => {
  it('覚えているタブの選択と、出す対象を別々に出す', () => {
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
      '出す対象はピン留めしたもののコピーではない。両方出さないと、留めてあるのにタブが無い理由が見えない',
    ).toEqual(['-w-a']);
  });

  it('`preferences.json` をどう読めたかを添える', () => {
    expect(presentPreferences(view({})).stored).toEqual({
      state: 'observed',
      reason: null,
    });
    expect(
      presentPreferences(view({ stored: absent('no-source') })).stored,
      'まだ選んでいないのと、観測できなかったのは別の事実である',
    ).toEqual({ state: 'absent', reason: 'no-source' });
    expect(
      presentPreferences(view({ stored: unobservable(new StoreError('読めない')) })).stored,
      '観測できなかったときは、どのエラーかをエラーコードで言う',
    ).toEqual({ state: 'unobservable', reason: 'preferences.unreadable' });
  });

  it('外へ出す欄はこの 4 つだけ', () => {
    expect(
      Object.keys(presentPreferences(view({}))),
      '欄を足すと、受け取る側が形を二通り覚えることになる',
    ).toEqual(['tab_selection', 'visible_tabs', 'locale', 'stored']);
  });
});

/* 選んだ言葉は、その人が選んだものである。**選んでいないことを、英語を選んだことにしない** ——
   潰すと、選んでいない人の画面がブラウザーの言葉を見に行けなくなる。 */
describe('選ばれた画面の言葉', () => {
  it('選ばれていれば、その綴りをそのまま出す', () => {
    expect(presentPreferences(view({ locale: 'zh-Hant' })).locale).toBe('zh-Hant');
  });

  it('まだ選んでいなければ、無いと言う', () => {
    expect(
      presentPreferences(view({ locale: null })).locale,
      '英語へ倒すと、選んでいない人がブラウザーの言葉を出せなくなる',
    ).toBeNull();
  });
});
