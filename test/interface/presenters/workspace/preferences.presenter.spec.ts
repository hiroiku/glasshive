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

const DEFAULT: View['watched'] = { version: 2, paths: [] };

const view = (parts: Partial<View>): View => ({
  watched: DEFAULT,
  visibleTabs: [],
  locale: null,
  stored: observed(DEFAULT),
  ...parts,
});

describe('記録を外部 API の形へ変換する', () => {
  it('覚えている記録と、出す対象を別々に出す', () => {
    const presented = presentPreferences(
      view({
        watched: { version: 2, paths: ['/w/a', '/w/gone'] },
        visibleTabs: ['-w-a'],
      }),
    );

    expect(presented.watched, '記録は絶対パスで持つ。id はパスから決まる').toEqual([
      '/w/a',
      '/w/gone',
    ]);
    expect(
      presented.visible_tabs,
      '出す対象は記録のコピーではない。両方出さないと、記録してあるのにタブが無い理由が見えない',
    ).toEqual(['-w-a']);
  });

  it('`preferences.json` をどう読めたかを添える', () => {
    expect(presentPreferences(view({})).stored).toEqual({
      state: 'observed',
      reason: null,
    });
    expect(
      presentPreferences(view({ stored: absent('no-source') })).stored,
      'まだ何も決めていないのと、観測できなかったのは別の事実である',
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
    ).toEqual(['watched', 'visible_tabs', 'locale', 'stored', 'candidates']);
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

/* 選び直すための候補。**記録するときに名指すのは id である** —— 画面がパスを名指せると、
   開いているどのページも任意のディレクトリを glasshive に読ませられる。 */
describe('まだ記録していないディレクトリ', () => {
  const candidate = (id: string, latestActivityMs: number) => ({
    id,
    name: id,
    path: `/w/${id}`,
    latestActivityMs,
  });

  it('新しく動いたものから並べる', () => {
    const json = presentPreferences(view({}), [
      candidate('古い', 1_000),
      candidate('新しい', 9_000),
    ]);

    expect(
      json.candidates.map((one) => one.id),
      '探しているのは、たいてい直前まで居た場所である',
    ).toEqual(['新しい', '古い']);
  });

  it('時刻は読める形にしてから出す', () => {
    const json = presentPreferences(view({}), [candidate('a', Date.parse('2026-08-09T12:00:00Z'))]);

    expect(json.candidates[0]?.last_activity).toBe('2026-08-09T12:00:00Z');
  });

  /* 名前から場所を起こすと、当てずっぽうが場所として並ぶ。 */
  it('場所を読めていないものは、`null` のまま出す', () => {
    const json = presentPreferences(view({}), [{ ...candidate('a', 0), path: null }]);

    expect(json.candidates[0]?.path).toBeNull();
  });
});
