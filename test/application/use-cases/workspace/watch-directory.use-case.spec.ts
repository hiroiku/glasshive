import { describe, expect, it } from 'vitest';
import { AppError } from '~/app-kernel/error.ts';
import { absent, type Observation, observed, unobservable } from '~/app-kernel/observation.ts';
import { err, ok, type Result } from '~/app-kernel/result.ts';
import type { ViewerPreferencesRepository } from '~/application/ports/repositories/workspace/viewer-preferences.repository.ts';
import { documentOf } from '~/application/services/workspace/preferences-document.service.ts';
import { createWatchDirectory } from '~/application/use-cases/workspace/watch-directory.use-case.ts';

/* コマンドラインが名指したディレクトリを記録する。

   **ここだけはパスを受け取る。** 画面からパスを名指せると、開いているどのページも任意の
   ディレクトリを glasshive に読ませられる。見分けるのは求めが届いた側で、ここへは
   見分けた結果だけが来る。 */

class RefusedError extends AppError {
  readonly code = 'preferences.refused';
}

class StoreError extends AppError {
  readonly code = 'preferences.unreadable';
}

/** 記録した形の `preferences.json` */
const watching = (...paths: string[]) => documentOf({ version: 2, paths }, null);

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

const savedIn = (document: string | undefined) => JSON.parse(document ?? 'null');

const watchDirectory = (store: ReturnType<typeof fakeStore>) =>
  createWatchDirectory({ preferences: store.repository });

describe('名指されたディレクトリを記録する', () => {
  it('まだ記録していなければ、足して置く', async () => {
    const store = fakeStore();

    const added = await watchDirectory(store).execute('/w/repo');

    expect(added).toBe(true);
    expect(savedIn(store.written[0]).watched).toEqual(['/w/repo']);
  });

  it('いま置いてある記録の末尾に足す', async () => {
    const store = fakeStore({ stored: observed(watching('/w/他')) });

    await watchDirectory(store).execute('/w/repo');

    expect(
      savedIn(store.written[0]).watched,
      '読んでから置くまでの間に足されたぶんが、置き換えで消える',
    ).toEqual(['/w/他', '/w/repo']);
  });

  /* 置き直すと、並びを変えていないのに `preferences.json` の更新時刻だけが動く。 */
  it('すでに記録して在れば、置きに行かない', async () => {
    const store = fakeStore({ stored: observed(watching('/w/repo')) });

    const added = await watchDirectory(store).execute('/w/repo');

    expect(added).toBe(false);
    expect(store.written).toEqual([]);
  });

  it('書き表し方が違っても、同じ場所なら置きに行かない', async () => {
    const store = fakeStore({ stored: observed(watching('/w/repo')) });

    expect(await watchDirectory(store).execute('/w/repo/')).toBe(false);
  });

  /* 倒したコピーに足して置けば、その推測がそのまま保存され、記録してあったものが消える。 */
  it('`preferences.json` を読めなかったときは、置きに行かない', async () => {
    const store = fakeStore({ stored: unobservable(new StoreError('読めない')) });

    const added = await watchDirectory(store).execute('/w/repo');

    expect(added, 'ひととき読めなかっただけで、記録を丸ごと捨てることになる').toBe(false);
    expect(store.written).toEqual([]);
  });

  it('選んだ言葉は、記録を足しても残る', async () => {
    const store = fakeStore({ stored: observed(documentOf({ version: 2, paths: [] }, 'ja')) });

    await watchDirectory(store).execute('/w/repo');

    expect(savedIn(store.written[0]).locale).toBe('ja');
  });

  /* 保存先がそのプロジェクトのデータディレクトリの中を指していれば、ここで断られる。 */
  it('名指されたディレクトリを、書いてよいかの材料として渡す', async () => {
    const store = fakeStore();

    await watchDirectory(store).execute('/w/repo');

    expect(store.seenRoots[0]).toEqual(['/w/repo']);
  });

  /* 記録できなくても観測は続く。開く先は今までどおり答えられて、次に読み込んだときに
     一覧から消えるだけである。 */
  it('置けなかったときは、置けた振りをしない', async () => {
    const store = fakeStore({ refuse: true });

    expect(await watchDirectory(store).execute('/w/repo')).toBe(false);
  });
});
