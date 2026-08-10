import { describe, expect, it } from 'vitest';
import { AppError } from '~/app-kernel/error.ts';
import { absent, type Observation, observed, unobservable } from '~/app-kernel/observation.ts';
import { ok, type Result } from '~/app-kernel/result.ts';
import type { ViewerPreferencesRepository } from '~/application/ports/repositories/workspace/viewer-preferences.repository.ts';
import { documentOf } from '~/application/services/workspace/preferences-document.service.ts';
import { createReadPreferences } from '~/application/use-cases/workspace/read-preferences.use-case.ts';

class StoreError extends AppError {
  readonly code = 'preferences.unreadable';
}

/** まだ何も選んでいないときの形。既定は glasshive が推し量らないことを言う値である */
const DEFAULT = { version: 1, mode: 'all', pinned: [], hidden: [] } as const;

/** `preferences.json` の偽物。読めたテキストを差し替え、置きに行ったかを数える */
function fakeStore(loaded: Observation<string>) {
  let saves = 0;
  const repository: ViewerPreferencesRepository = {
    async load() {
      return loaded;
    },
    async save(): Promise<Result<void>> {
      saves += 1;
      return ok(undefined);
    },
  };
  return { repository, saveCount: () => saves };
}

const read = (loaded: Observation<string>) =>
  createReadPreferences({ preferences: fakeStore(loaded).repository });

describe('`preferences.json` を読む', () => {
  it('読めたタブの選択を、観測と突き合わせて返す', async () => {
    const stored = documentOf({
      version: 1,
      mode: 'pinned',
      pinned: ['-w-alpha', '-w-gone'],
      hidden: [],
    });

    const view = await read(observed(stored)).execute(['-w-alpha', '-w-beta']);
    expect(view.selection.pinned, '一覧から消えた id も、留めたまま残る').toEqual([
      '-w-alpha',
      '-w-gone',
    ]);
    expect(view.visibleTabs, '出すのは観測に在るものだけ').toEqual(['-w-alpha']);
  });

  it('`preferences.json` がまだ無ければ、既定へ倒れる', async () => {
    const view = await read(absent('no-source')).execute(['-w-alpha']);
    expect(view.selection).toEqual(DEFAULT);
    expect(view.visibleTabs, 'glasshive が推し量って留めない').toEqual([]);
  });

  it('壊れた `preferences.json` でも、既定へ倒れるだけで例外を投げない', async () => {
    const view = await read(observed('{"version": 1,')).execute(['-w-alpha']);
    expect(
      view.selection,
      '`preferences.json` が壊れても観測は止まらない。起きるのは選び直すことだけ',
    ).toEqual(DEFAULT);
    expect(view.stored, '壊れていたのは「読めるものが無い」ことである').toEqual({
      kind: 'absent',
      reason: 'empty',
    });
  });

  it('観測できなくても、既定へ倒れるだけで例外を投げない', async () => {
    const view = await read(unobservable(new StoreError('読めない'))).execute(['-w-alpha']);
    expect(view.selection).toEqual(DEFAULT);
  });

  /* 整えた結果を置き直したくなるが、置いた瞬間に「一覧を見ただけで
     `preferences.json` が書き換わる」ことになり、読み取り専用でなくなる。 */
  it('読むだけの経路は、置きに行かない', async () => {
    const store = fakeStore(
      observed(
        documentOf({
          version: 1,
          mode: 'all',
          pinned: ['-w-a', '-w-a'],
          hidden: [],
        }),
      ),
    );

    await createReadPreferences({ preferences: store.repository }).execute(['-w-a']);

    expect(store.saveCount(), '整え直した結果を置き戻すと、読む経路が書く経路になる').toBe(0);
  });

  it('なぜ倒れたのかは、値として残す', async () => {
    const missing = await read(absent('no-source')).execute([]);
    expect(missing.stored, 'まだ選んでいないのと、観測できなかったのは別の事実である').toEqual({
      kind: 'absent',
      reason: 'no-source',
    });

    const broken = await read(unobservable(new StoreError('読めない'))).execute([]);
    expect(broken.stored.kind).toBe('unobservable');
  });
});
