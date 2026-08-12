import { describe, expect, it } from 'vitest';
import { AppError } from '~/app-kernel/error.ts';
import { absent, type Observation, observed, unobservable } from '~/app-kernel/observation.ts';
import { err, ok, type Result } from '~/app-kernel/result.ts';
import type { ViewerPreferencesRepository } from '~/application/ports/repositories/workspace/viewer-preferences.repository.ts';
import { documentOf } from '~/application/services/workspace/preferences-document.service.ts';
import {
  createWritePreferences,
  type PreferenceAction,
} from '~/application/use-cases/workspace/write-preferences.use-case.ts';

/** 断りの偽物。エラーコードだけが同じであればよく、実装の側の型は要らない */
class RefusedError extends AppError {
  readonly code = 'preferences.refused';
}

class StoreError extends AppError {
  readonly code = 'preferences.unreadable';
}

/** 記録した形の `preferences.json` */
const watching = (...paths: string[]) => documentOf({ version: 2, paths }, null);

/** `preferences.json` の偽物。置かれたテキストと、渡されたプロジェクトのパスを覚えておく */
function fakeStore(options: { stored?: Observation<string>; refuse?: boolean } = {}) {
  const written: string[] = [];
  const seenRoots: (readonly string[])[] = [];
  let stored = options.stored ?? absent('no-source');
  const repository: ViewerPreferencesRepository = {
    async load() {
      return stored;
    },
    async save(document, { observedRoots }): Promise<Result<void>> {
      seenRoots.push(observedRoots);
      if (options.refuse === true) return err(new RefusedError('観測元の中'));
      written.push(document);
      stored = observed(document);
      return ok(undefined);
    },
  };
  return { repository, written, seenRoots };
}

/** 置かれたテキストを、記録として見る。テキストのままでは何が置かれたか読めない */
const savedIn = (document: string | undefined) => JSON.parse(document ?? 'null');

/* 観測できているプロジェクト。**id とパスの対応が要る** —— 受け取るのは id で、
   覚えておくのはパスである。 */
const rowsOf = (pairs: readonly [string, string][]) => pairs.map(([id, path]) => ({ id, path }));

const execute = (
  store: ReturnType<typeof fakeStore>,
  action: PreferenceAction,
  scope: { seen?: readonly [string, string][]; roots?: readonly string[] } = {},
) => {
  const rows = rowsOf(scope.seen ?? [['-w-a', '/w/a']]);
  return createWritePreferences({ preferences: store.repository }).execute({
    action,
    observed: rows,
    known: rows,
    observedRoots: scope.roots ?? [],
  });
};

describe('観る・やめる・並べ替えを、向こう側の 1 つの操作にする', () => {
  it('観ると決めると、`preferences.json` に足されて返る', async () => {
    const store = fakeStore();

    const saved = await execute(store, { action: 'watch', id: '-w-a' });

    expect(savedIn(store.written[0])).toEqual({
      version: 2,
      watched: ['/w/a'],
      locale: null,
    });
    if (!saved.ok) throw new Error('置けなかった');
    expect(saved.value.visibleTabs).toEqual(['-w-a']);
    expect(
      saved.value.stored,
      'いま置いたものが `preferences.json` の中身である。ここを倒すと、置けた直後に「まだ何も観ていない」と見える',
    ).toEqual({ kind: 'observed', value: saved.value.watched });
  });

  /* 受け取るのは id で、覚えておくのはパスである。**ブラウザーはパスを名指せない** ——
     名指せると、開いているどのページも任意のディレクトリを glasshive に読ませられる。 */
  it('見つけたものの中に居ない id は断る', async () => {
    const store = fakeStore();

    const saved = await execute(store, { action: 'watch', id: '-w-どこ' });

    expect(saved.ok).toBe(false);
    if (saved.ok) throw new Error('通ってしまった');
    expect(saved.error.code).toBe('project.not_observed');
    expect(store.written, '読み替えられないものを置くと、二度とパスへ戻せない行が残る').toEqual([]);
  });

  /* 丸ごとの記録を受け取ると、求める側が読んでから置くまでの間に別のクライアントが足したぶんが、
     置き換えで黙って消える。読み直してから当てることでしか塞げない。 */
  it('当てる相手は、いま置いてある `preferences.json` である', async () => {
    const store = fakeStore({ stored: observed(watching('/w/他')) });

    const saved = await execute(store, { action: 'watch', id: '-w-a' });

    expect(
      savedIn(store.written[0]).watched,
      'クライアント側のコピーに当てて丸ごと置くと、別のクライアントが足したぶんが消える',
    ).toEqual(['/w/他', '/w/a']);
    if (!saved.ok) throw new Error('置けなかった');
    expect(saved.value.watched.paths).toEqual(['/w/他', '/w/a']);
  });

  it('やめると、`preferences.json` から消えて返る', async () => {
    const store = fakeStore({ stored: observed(watching('/w/a', '/w/b')) });

    await execute(store, { action: 'unwatch', id: '-w-a' });

    expect(savedIn(store.written[0]).watched).toEqual(['/w/b']);
  });

  it('並べ替えると、その順のまま置かれる', async () => {
    const store = fakeStore({ stored: observed(watching('/w/a', '/w/b', '/w/c')) });

    await execute(
      store,
      { action: 'move', id: '-w-c', toIndex: 0 },
      {
        seen: [
          ['-w-a', '/w/a'],
          ['-w-b', '/w/b'],
          ['-w-c', '/w/c'],
        ],
      },
    );

    expect(savedIn(store.written[0]).watched, '並びの順がそのまま表示の順である').toEqual([
      '/w/c',
      '/w/a',
      '/w/b',
    ]);
  });

  /* 押した人が見ているのはタブ行である。記録には観測できていない場所も残っているので、
     行の位置をそのまま記録の位置として使うと、落とした先がずれる。 */
  it('落とす先は、タブ行の位置で受けて記録の位置へ読み替える', async () => {
    const store = fakeStore({ stored: observed(watching('/w/gone', '/w/a', '/w/b')) });

    await execute(
      store,
      { action: 'move', id: '-w-b', toIndex: 0 },
      {
        seen: [
          ['-w-a', '/w/a'],
          ['-w-b', '/w/b'],
        ],
      },
    );

    expect(
      savedIn(store.written[0]).watched,
      '行の位置をそのまま使うと、観測できない場所のぶんだけずれる',
    ).toEqual(['/w/gone', '/w/b', '/w/a']);
  });

  /* タブ行の末尾へ落とすと、行の上には「この手前」と読める相手が居ない。記録の末尾へ回す。 */
  it('行の末尾へ落とすと、記録の末尾へ回る', async () => {
    const store = fakeStore({ stored: observed(watching('/w/a', '/w/b')) });

    await execute(
      store,
      { action: 'move', id: '-w-a', toIndex: 1 },
      {
        seen: [
          ['-w-a', '/w/a'],
          ['-w-b', '/w/b'],
        ],
      },
    );

    expect(savedIn(store.written[0]).watched, '手前が居ないのを先頭と読むと、逆へ動く').toEqual([
      '/w/b',
      '/w/a',
    ]);
  });

  it('形を整えてから置く', async () => {
    const store = fakeStore({
      stored: observed(JSON.stringify({ version: 2, watched: ['/w/b', '/w/a', '/w/b'] })),
    });

    await execute(store, { action: 'watch', id: '-w-c' }, { seen: [['-w-c', '/w/c']] });

    expect(savedIn(store.written[0]), '整えずに置くと、読むたびに整え直すことになる').toEqual({
      version: 2,
      watched: ['/w/b', '/w/a', '/w/c'],
      locale: null,
    });
  });

  it('観測できていない場所も、そのまま置く', async () => {
    const store = fakeStore({ stored: observed(watching('/w/gone')) });

    const saved = await execute(store, { action: 'watch', id: '-w-a' });

    expect(
      savedIn(store.written[0]).watched,
      '観測に合わせて削ると、繋ぎ直したときに記録し直させる',
    ).toEqual(['/w/gone', '/w/a']);
    if (!saved.ok) throw new Error('置けなかった');
    expect(saved.value.visibleTabs, '残すことと出すことは別である').toEqual(['-w-a']);
  });

  /* 読む側は既定へ倒してよい。倒しても記録が「まだ何も観ていない」に見えるだけで、
     次に読めたときには戻る。置く側で同じことをすると、推測がそのまま書き込まれる。 */
  it('`preferences.json` を読めなかったときは、置きに行かない', async () => {
    const store = fakeStore({ stored: unobservable(new StoreError('読めない')) });

    const saved = await execute(store, { action: 'watch', id: '-w-a' });

    expect(saved.ok, 'ひととき読めなかっただけで、記録を丸ごと捨てることになる').toBe(false);
    if (saved.ok) throw new Error('既定で上書きしてしまった');
    expect(saved.error.code, '次に求めれば通るかもしれない側に倒す').toBe('preferences.unreadable');
    expect(store.written, '読めていないものへは、何も置かない').toEqual([]);
  });

  it('読める形になっていない `preferences.json` の上には、置いてよい', async () => {
    const store = fakeStore({ stored: observed('{"version": 2,') });

    const saved = await execute(store, { action: 'watch', id: '-w-a' });

    expect(saved.ok, '読めないテキストは捨てると決めてある。倒しても失うものが無い').toBe(true);
    expect(savedIn(store.written[0]).watched).toEqual(['/w/a']);
  });

  it('まだ `preferences.json` が無ければ、既定の上に置く', async () => {
    const store = fakeStore({ stored: absent('no-source') });

    const saved = await execute(store, { action: 'watch', id: '-w-a' });

    expect(saved.ok).toBe(true);
    expect(savedIn(store.written[0]).watched).toEqual(['/w/a']);
  });

  it('観測したプロジェクトのパスを、そのままポートへ渡す', async () => {
    const store = fakeStore();

    await execute(store, { action: 'watch', id: '-w-a' }, { roots: ['/w/proj'] });

    expect(store.seenRoots[0], '書いてよいかを決める材料は、呼ぶ側が渡す').toEqual(['/w/proj']);
  });

  it('断られたときは、置けた振りをしない', async () => {
    const store = fakeStore({ refuse: true });

    const saved = await execute(store, { action: 'watch', id: '-w-a' }, { roots: ['/w/proj'] });

    expect(saved.ok).toBe(false);
    if (saved.ok) throw new Error('置けてしまった');
    expect(saved.error.code, '断りは投げない。呼び出しの結果として返す').toBe(
      'preferences.refused',
    );
    expect(store.written, '断ったのだから、何も置かれていない').toEqual([]);
  });
});

/* 選んだ言葉も `preferences.json` に入っている。**片方の操作でもう片方を落とさない** ——
   足すたびに選んだ言葉が消えると、選び直したのに戻ったように見える。 */
describe('画面の言葉を選ぶ', () => {
  it('選んだ言葉が、`preferences.json` に置かれて返る', async () => {
    const store = fakeStore();

    const saved = await execute(store, { action: 'locale', locale: 'ko' });

    expect(savedIn(store.written[0]).locale).toBe('ko');
    if (!saved.ok) throw new Error('置けなかった');
    expect(saved.value.locale).toBe('ko');
  });

  it('言葉を選んでも、記録は残る', async () => {
    const store = fakeStore({ stored: observed(watching('/w/a')) });

    await execute(store, { action: 'locale', locale: 'ja' });

    expect(savedIn(store.written[0]).watched, '言葉を選んだだけで、記録が消えた').toEqual(['/w/a']);
  });

  it('記録を足しても、選んだ言葉は残る', async () => {
    const store = fakeStore({ stored: observed(documentOf({ version: 2, paths: [] }, 'zh-Hant')) });

    const saved = await execute(store, { action: 'watch', id: '-w-a' });

    expect(
      savedIn(store.written[0]).locale,
      '足すたびに言葉が消えると、選び直したのに戻ったように見える',
    ).toBe('zh-Hant');
    if (!saved.ok) throw new Error('置けなかった');
    expect(saved.value.locale).toBe('zh-Hant');
  });

  /* `null` は英語ではなく「選ぶのをやめる」である。選び直せる先が無いと、一度選んだ人は
     ブラウザーの言葉へ戻れなくなる。 */
  it('選ぶのをやめられる', async () => {
    const store = fakeStore({ stored: observed(documentOf({ version: 2, paths: [] }, 'ja')) });

    const saved = await execute(store, { action: 'locale', locale: null });

    expect(savedIn(store.written[0]).locale).toBeNull();
    if (!saved.ok) throw new Error('置けなかった');
    expect(saved.value.locale, '英語を選んだことにすると、ブラウザーの言葉へ戻れない').toBeNull();
  });
});
