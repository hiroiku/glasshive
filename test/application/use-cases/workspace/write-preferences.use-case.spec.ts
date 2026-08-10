import { describe, expect, it } from 'vitest';
import { AppError } from '~/app-kernel/error.ts';
import { absent, type Observation, observed, unobservable } from '~/app-kernel/observation.ts';
import { err, ok, type Result } from '~/app-kernel/result.ts';
import type { ViewerPreferencesRepository } from '~/application/ports/repositories/workspace/viewer-preferences.repository.ts';
import { documentOf } from '~/application/services/workspace/preferences-document.service.ts';
import {
  createWritePreferences,
  type TabAction,
} from '~/application/use-cases/workspace/write-preferences.use-case.ts';

/** 断りの偽物。エラーコードだけが同じであればよく、実装の側の型は要らない */
class RefusedError extends AppError {
  readonly code = 'preferences.refused';
}

class StoreError extends AppError {
  readonly code = 'preferences.unreadable';
}

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

/** 置かれたテキストを、タブの選択として見る。テキストのままでは何が置かれたか読めない */
const selectionIn = (document: string | undefined) => JSON.parse(document ?? 'null');

const execute = (
  store: ReturnType<typeof fakeStore>,
  action: TabAction,
  scope: { ids?: readonly string[]; roots?: readonly string[] } = {},
) =>
  createWritePreferences({ preferences: store.repository }).execute({
    action,
    observedIds: scope.ids ?? [],
    observedRoots: scope.roots ?? [],
  });

describe('留める・外す・並べ替えを、向こう側の 1 つの操作にする', () => {
  it('留めると、`preferences.json` に足されて返る', async () => {
    const store = fakeStore();

    const saved = await execute(store, { action: 'pin', id: '-w-a' }, { ids: ['-w-a'] });

    expect(selectionIn(store.written[0])).toEqual({
      version: 1,
      mode: 'all',
      pinned: ['-w-a'],
      hidden: [],
    });
    if (!saved.ok) throw new Error('置けなかった');
    expect(saved.value.visibleTabs).toEqual(['-w-a']);
    expect(
      saved.value.stored,
      'いま置いたものが `preferences.json` の中身である。ここを倒すと、置けた直後に「まだ選んでいない」と見える',
    ).toEqual({ kind: 'observed', value: saved.value.selection });
  });

  /* 丸ごとの選択を受け取ると、求める側が読んでから置くまでの間に別のクライアントが留めたぶんが、
     置き換えで黙って消える。読み直してから当てることでしか塞げない。 */
  it('当てる相手は、いま置いてある `preferences.json` である', async () => {
    const store = fakeStore({
      stored: observed(documentOf({ version: 1, mode: 'all', pinned: ['-w-他'], hidden: [] })),
    });

    const saved = await execute(store, { action: 'pin', id: '-w-a' });

    expect(
      selectionIn(store.written[0]).pinned,
      'クライアント側のコピーに当てて丸ごと置くと、別のクライアントが留めたぶんが消える',
    ).toEqual(['-w-他', '-w-a']);
    if (!saved.ok) throw new Error('置けなかった');
    expect(saved.value.selection.pinned).toEqual(['-w-他', '-w-a']);
  });

  it('外すと、`preferences.json` から消えて返る', async () => {
    const store = fakeStore({
      stored: observed(
        documentOf({
          version: 1,
          mode: 'all',
          pinned: ['-w-a', '-w-b'],
          hidden: [],
        }),
      ),
    });

    await execute(store, { action: 'unpin', id: '-w-a' });

    expect(selectionIn(store.written[0])).toEqual({
      version: 1,
      mode: 'all',
      pinned: ['-w-b'],
      // 外すのはタブの並びから下ろすことで、一覧から消すことではない
      hidden: [],
    });
  });

  it('並べ替えると、その順のまま置かれる', async () => {
    const store = fakeStore({
      stored: observed(
        documentOf({
          version: 1,
          mode: 'all',
          pinned: ['-w-a', '-w-b', '-w-c'],
          hidden: [],
        }),
      ),
    });

    await execute(store, { action: 'move', id: '-w-c', toIndex: 0 });

    expect(selectionIn(store.written[0]).pinned, '並びの順がそのまま表示の順である').toEqual([
      '-w-c',
      '-w-a',
      '-w-b',
    ]);
  });

  it('形を整えてから置く', async () => {
    const store = fakeStore({
      stored: observed(
        JSON.stringify({
          version: 1,
          mode: 'all',
          pinned: ['-w-b', '-w-a', '-w-b'],
          hidden: ['-w-a', '-w-noise'],
        }),
      ),
    });

    await execute(store, { action: 'pin', id: '-w-c' });

    expect(selectionIn(store.written[0]), '整えずに置くと、読むたびに整え直すことになる').toEqual({
      version: 1,
      mode: 'all',
      pinned: ['-w-b', '-w-a', '-w-c'],
      hidden: ['-w-noise'],
    });
  });

  it('一覧から消えた id も、そのまま置く', async () => {
    const store = fakeStore({
      stored: observed(
        documentOf({
          version: 1,
          mode: 'all',
          pinned: ['-w-gone'],
          hidden: [],
        }),
      ),
    });

    const saved = await execute(store, { action: 'pin', id: '-w-a' }, { ids: ['-w-a'] });

    expect(
      selectionIn(store.written[0]).pinned,
      '観測に合わせて削ると、繋ぎ直したときに留め直させる',
    ).toEqual(['-w-gone', '-w-a']);
    if (!saved.ok) throw new Error('置けなかった');
    expect(saved.value.visibleTabs, '残すことと出すことは別である').toEqual(['-w-a']);
  });

  /* 読む側は既定へ倒してよい。倒してもピン留めが「留めていない」に見えるだけで、
     次に読めたときには戻る。置く側で同じことをすると、推測がそのまま書き込まれる。 */
  it('`preferences.json` を読めなかったときは、置きに行かない', async () => {
    const store = fakeStore({
      stored: unobservable(new StoreError('読めない')),
    });

    const saved = await execute(store, { action: 'pin', id: '-w-a' });

    expect(saved.ok, 'ひととき読めなかっただけで、タブの並びを丸ごと捨てることになる').toBe(false);
    if (saved.ok) throw new Error('既定で上書きしてしまった');
    expect(saved.error.code, '次に求めれば通るかもしれない側に倒す').toBe('preferences.unreadable');
    expect(store.written, '読めていないものへは、何も置かない').toEqual([]);
  });

  it('読める形になっていない `preferences.json` の上には、置いてよい', async () => {
    const store = fakeStore({ stored: observed('{"version": 1,') });

    const saved = await execute(store, { action: 'pin', id: '-w-a' });

    expect(saved.ok, '読めないテキストは捨てると決めてある。倒しても失うものが無い').toBe(true);
    expect(selectionIn(store.written[0]).pinned).toEqual(['-w-a']);
  });

  it('まだ `preferences.json` が無ければ、既定の上に置く', async () => {
    const store = fakeStore({ stored: absent('no-source') });

    const saved = await execute(store, { action: 'pin', id: '-w-a' });

    expect(saved.ok).toBe(true);
    expect(selectionIn(store.written[0]).pinned).toEqual(['-w-a']);
  });

  it('観測したプロジェクトのパスを、そのままポートへ渡す', async () => {
    const store = fakeStore();

    await execute(store, { action: 'pin', id: '-w-a' }, { roots: ['/w/proj'] });

    expect(store.seenRoots[0], '書いてよいかを決める材料は、呼ぶ側が渡す').toEqual(['/w/proj']);
  });

  it('断られたときは、置けた振りをしない', async () => {
    const store = fakeStore({ refuse: true });

    const saved = await execute(store, { action: 'pin', id: '-w-a' }, { roots: ['/w/proj'] });

    expect(saved.ok).toBe(false);
    if (saved.ok) throw new Error('置けてしまった');
    expect(saved.error.code, '断りは投げない。呼び出しの結果として返す').toBe(
      'preferences.refused',
    );
    expect(store.written, '断ったのだから、何も置かれていない').toEqual([]);
  });
});
