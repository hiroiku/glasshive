import { describe, expect, it } from 'vitest';
import { AppError } from '~/app-kernel/error.ts';
import { absent, type Observation, observed, unobservable } from '~/app-kernel/observation.ts';
import { ok, type Result } from '~/app-kernel/result.ts';
import type { ViewerPreferencesRepository } from '~/application/ports/repositories/workspace/viewer-preferences.repository.ts';
import { documentOf } from '~/application/services/workspace/preferences-document.service.ts';
import {
  createReadPreferences,
  type PreferencesInput,
} from '~/application/use-cases/workspace/read-preferences.use-case.ts';

class StoreError extends AppError {
  readonly code = 'preferences.unreadable';
}

/** まだ何も決めていないときの形。既定は glasshive が推し量らないことを言う値である */
const DEFAULT = { version: 2, paths: [] } as const;

/** 記録した形の `preferences.json` */
const watching = (...paths: string[]) => documentOf({ version: 2, paths }, null);

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

/** 観測できているプロジェクト。id とパスの対応だけを渡す */
const seen = (...pairs: [string, string][]): PreferencesInput => {
  const rows = pairs.map(([id, path]) => ({ id, path }));
  return { observed: rows, known: rows };
};

describe('`preferences.json` を読む', () => {
  it('読めた記録を、観測と突き合わせて返す', async () => {
    const view = await read(observed(watching('/w/alpha', '/w/gone'))).execute(
      seen(['-w-alpha', '/w/alpha'], ['-w-beta', '/w/beta']),
    );

    expect(view.watched.paths, '観測できていない場所も、記録には残る').toEqual([
      '/w/alpha',
      '/w/gone',
    ]);
    expect(view.visibleTabs, '出すのは観測に在るものだけ').toEqual(['-w-alpha']);
  });

  it('`preferences.json` がまだ無ければ、既定へ倒れる', async () => {
    const view = await read(absent('no-source')).execute(seen(['-w-alpha', '/w/alpha']));

    expect(view.watched).toEqual(DEFAULT);
    expect(view.visibleTabs, 'glasshive が推し量って観はじめない').toEqual([]);
  });

  it('壊れた `preferences.json` でも、既定へ倒れるだけで例外を投げない', async () => {
    const view = await read(observed('{"version": 2,')).execute(seen(['-w-alpha', '/w/alpha']));

    expect(
      view.watched,
      '`preferences.json` が壊れても観測は止まらない。起きるのは選び直すことだけ',
    ).toEqual(DEFAULT);
    expect(view.stored, '壊れていたのは「読めるものが無い」ことである').toEqual({
      kind: 'absent',
      reason: 'empty',
    });
  });

  it('観測できなくても、既定へ倒れるだけで例外を投げない', async () => {
    const view = await read(unobservable(new StoreError('読めない'))).execute(seen());

    expect(view.watched).toEqual(DEFAULT);
  });

  /* 整えた結果を置き直したくなるが、置いた瞬間に「一覧を見ただけで
     `preferences.json` が書き換わる」ことになり、読み取り専用でなくなる。 */
  it('読むだけの経路は、置きに行かない', async () => {
    const store = fakeStore(observed(watching('/w/a', '/w/a')));

    await createReadPreferences({ preferences: store.repository }).execute(seen(['-w-a', '/w/a']));

    expect(store.saveCount(), '整え直した結果を置き戻すと、読む経路が書く経路になる').toBe(0);
  });

  it('なぜ倒れたのかは、値として残す', async () => {
    const missing = await read(absent('no-source')).execute(seen());
    expect(missing.stored, 'まだ何も決めていないのと、観測できなかったのは別の事実である').toEqual({
      kind: 'absent',
      reason: 'no-source',
    });

    const broken = await read(unobservable(new StoreError('読めない'))).execute(seen());
    expect(broken.stored.kind).toBe('unobservable');
  });
});

/* 1 つ前の形は、留めた id しか持っていない。**捨てると、更新した日に一覧が黙って空になる。**
   id からパスは決まらないので、見つけたものの中に同じ id が居るときだけ読み替えられる。 */
describe('1 つ前の形からの引き継ぎ', () => {
  const pinned = (...ids: string[]) =>
    JSON.stringify({ version: 1, mode: 'all', pinned: ids, hidden: [], locale: null });

  it('留めてあった id を、見つけたもののパスへ読み替える', async () => {
    const view = await read(observed(pinned('-w-alpha', '-w-beta'))).execute(
      seen(['-w-beta', '/w/beta'], ['-w-alpha', '/w/alpha']),
    );

    expect(view.watched.paths, '留めてあった順のまま引き継ぐ').toEqual(['/w/alpha', '/w/beta']);
    expect(view.visibleTabs).toEqual(['-w-alpha', '-w-beta']);
  });

  /* 読み替えられなかったぶんは、そのプロジェクトが `~/.claude/projects` から消えている
     ということである。id しか無いものを記録に残しても、二度とパスへ戻せない。 */
  it('読み替えられない id は引き継がない', async () => {
    const view = await read(observed(pinned('-w-alpha', '-w-gone'))).execute(
      seen(['-w-alpha', '/w/alpha']),
    );

    expect(view.watched.paths).toEqual(['/w/alpha']);
  });

  it('今の形で読めるなら、前の形は見ない', async () => {
    const both = JSON.stringify({ version: 2, watched: ['/w/beta'], pinned: ['-w-alpha'] });

    const view = await read(observed(both)).execute(
      seen(['-w-alpha', '/w/alpha'], ['-w-beta', '/w/beta']),
    );

    expect(view.watched.paths).toEqual(['/w/beta']);
  });
});

/* 選んだ言葉も `preferences.json` に在る。**まだ選んでいないことを、英語を選んだことにしない** ——
   潰すと、選んでいない人の画面がブラウザーの言葉を見に行けなくなる。 */
describe('選ばれた画面の言葉を読む', () => {
  it('選ばれていれば、その綴りをそのまま返す', async () => {
    const view = await read(observed(documentOf({ version: 2, paths: [] }, 'zh-Hans'))).execute(
      seen(),
    );

    expect(view.locale).toBe('zh-Hans');
  });

  it('まだ選んでいなければ、無いと返す', async () => {
    const view = await read(observed(watching())).execute(seen());

    expect(view.locale, '英語へ倒すと、選んでいない人がブラウザーの言葉を出せなくなる').toBeNull();
  });

  it('`preferences.json` を読めなかったときも、無いと返す', async () => {
    const view = await read(unobservable(new StoreError('読めない'))).execute(seen());

    expect(view.locale).toBeNull();
    expect(view.stored.kind, 'なぜ倒れたのかは、こちらに残っている').toBe('unobservable');
  });

  /* 1 つのパースで両方を読むと、片方の壊れ方がもう片方を巻き添えにする。 */
  it('記録が壊れていても、言葉は読める', async () => {
    const view = await read(observed('{"version":2,"watched":"/w/a","locale":"ja"}')).execute(
      seen(),
    );

    expect(view.watched).toEqual(DEFAULT);
    expect(view.locale, '記録の壊れ方が、選んだ言葉を巻き添えにしている').toBe('ja');
  });
});
