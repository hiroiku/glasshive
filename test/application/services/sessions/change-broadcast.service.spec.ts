import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppError } from '~/app-kernel/error.ts';
import { observed, unobservable } from '~/app-kernel/observation.ts';
import type { TranscriptWatchIntegration } from '~/application/ports/integrations/sessions/transcript-watch.integration.ts';
import {
  type ChangeMessage,
  createChangeBroadcast,
} from '~/application/services/sessions/change-broadcast.service.ts';

class TestError extends AppError {
  readonly code = 'test.watch_failed';
}

/** ウォッチャーの偽物。変更通知も、張った後の死も、好きなときに起こせる */
function fakeWatcher() {
  let notify: ((path: string) => void) | undefined;
  let replaced: (() => void) | undefined;
  let die: ((error: AppError) => void) | undefined;
  let closed = false;
  const integration: TranscriptWatchIntegration = {
    watch({ onChange, onTreeChange, onFail }) {
      notify = onChange;
      replaced = onTreeChange;
      die = onFail;
      return observed(() => {
        closed = true;
      });
    },
  };
  return {
    integration,
    fire: (path: string) => notify?.(path),
    replace: () => replaced?.(),
    kill: () => die?.(new TestError('張った後で死にました')),
    get closed() {
      return closed;
    },
  };
}

describe('変更通知を配る', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('静けさが続くまで束ね、最後に木そのものの通知を 1 度だけ添える', () => {
    const watcher = fakeWatcher();
    const broadcast = createChangeBroadcast(watcher.integration, {
      quietMs: 250,
    });
    const got: ChangeMessage[] = [];
    broadcast.subscribe((m) => got.push(m));

    watcher.fire('/a.jsonl');
    watcher.fire('/b.jsonl');
    watcher.fire('/a.jsonl'); // 同じものは 1 つにまとめられる

    expect(got, '静けさが来るまでは配らない').toEqual([]);

    vi.advanceTimersByTime(250);

    expect(got).toEqual([
      { kind: 'file', path: '/a.jsonl' },
      { kind: 'file', path: '/b.jsonl' },
      { kind: 'tree' },
    ]);
  });

  /* 木そのものが入れ替わったときは、名指せる `transcript` が 1 本も無い。**それでも黙らない**
     — 画面が持っているのは消えたほうの木なので、読み直させるところまでが変更通知である。 */
  it('木そのものが入れ替わったら、`file` を添えずに `tree` を配る', () => {
    const watcher = fakeWatcher();
    const broadcast = createChangeBroadcast(watcher.integration, { quietMs: 250 });
    const got: ChangeMessage[] = [];
    broadcast.subscribe((m) => got.push(m));

    watcher.replace();

    expect(got, '静けさが来るまでは配らない').toEqual([]);

    vi.advanceTimersByTime(250);

    expect(got, '動いた 1 本を名指せないことと、何も動いていないことは違う').toEqual([
      { kind: 'tree' },
    ]);
  });

  /* 1 回に配る `file` の数には上限がある。**溢れた分を捨ててはいけない** —
     開いている会話のパネルは `file` でしか追いつけないので、捨てられた 1 本を見ている
     ユーザーには、そのセッションだけが止まって見える。 */
  it('1 回に配りきれなかった `transcript` は、次の静けさで配る', () => {
    const watcher = fakeWatcher();
    const broadcast = createChangeBroadcast(watcher.integration, {
      quietMs: 10,
    });
    const got: ChangeMessage[] = [];
    broadcast.subscribe((m) => got.push(m));

    for (let i = 0; i < 25; i++) watcher.fire(`/s${i}.jsonl`);
    vi.advanceTimersByTime(10);

    const first = got.flatMap((m) => (m.kind === 'file' ? [m.path] : []));
    expect(first, '1 回に配るのは 20 件まで').toHaveLength(20);

    vi.advanceTimersByTime(10);

    const all = got.flatMap((m) => (m.kind === 'file' ? [m.path] : []));
    expect(all, '溢れた 5 件も、次の flush で届く').toEqual(
      Array.from({ length: 25 }, (_, i) => `/s${i}.jsonl`),
    );
  });

  it('溢れが無くなったら、それ以上は flush を起こさない', () => {
    const watcher = fakeWatcher();
    const broadcast = createChangeBroadcast(watcher.integration, {
      quietMs: 10,
    });
    const got: ChangeMessage[] = [];
    broadcast.subscribe((m) => got.push(m));

    watcher.fire('/a.jsonl');
    vi.advanceTimersByTime(10);
    const after = got.length;

    vi.advanceTimersByTime(1000);

    expect(got.length, '配るものが無いのに `tree` を配り続けない').toBe(after);
  });

  it('購読をやめたクライアントには、もう配らない', () => {
    const watcher = fakeWatcher();
    const broadcast = createChangeBroadcast(watcher.integration, {
      quietMs: 10,
    });
    const got: ChangeMessage[] = [];
    const stop = broadcast.subscribe((m) => got.push(m));

    expect(broadcast.listenerCount()).toBe(1);
    stop();
    expect(broadcast.listenerCount(), '去ったクライアントは数から外れる').toBe(0);

    watcher.fire('/a.jsonl');
    vi.advanceTimersByTime(10);

    expect(got, '去った後に届いてはいけない').toEqual([]);
  });

  it('1 つのクライアントが壊れても、他のクライアントへは配り続ける', () => {
    const watcher = fakeWatcher();
    const broadcast = createChangeBroadcast(watcher.integration, {
      quietMs: 10,
    });
    const got: ChangeMessage[] = [];
    broadcast.subscribe(() => {
      throw new Error('このクライアントは壊れている');
    });
    broadcast.subscribe((m) => got.push(m));

    watcher.fire('/a.jsonl');
    vi.advanceTimersByTime(10);

    expect(got).toEqual([{ kind: 'file', path: '/a.jsonl' }, { kind: 'tree' }]);
  });

  it('ウォッチャーを張れなかったことは、値として残る', () => {
    const broken: TranscriptWatchIntegration = {
      watch: () => unobservable(new TestError('張れませんでした')),
    };
    const broadcast = createChangeBroadcast(broken, { quietMs: 10 });

    const state = broadcast.watchState();
    expect(state.kind, '張れないことは、無かったのではなく観測できなかったこと').toBe(
      'unobservable',
    );
    expect(broadcast.listenerCount(), '張れなくてもクライアントは受け付ける').toBe(0);
    expect(() => broadcast.subscribe(() => {})).not.toThrow();
  });

  /* 張った後に死ぬのは珍しくない(macOS の FSEvents、後から上限に当たった Linux)。
     そこで黙ると、繋がったままのクライアントは更新が止まったことを知りようがない。 */
  it('張った後にウォッチャーが死んだら、観測できなかったへ動く', () => {
    const watcher = fakeWatcher();
    const broadcast = createChangeBroadcast(watcher.integration, {
      quietMs: 10,
    });

    expect(broadcast.watchState().kind, '張れた直後は観測できている').toBe('observed');

    watcher.kill();

    const state = broadcast.watchState();
    expect(state.kind, '死んだことは、無かったのではなく観測できなかったこと').toBe('unobservable');
    if (state.kind === 'unobservable') expect(state.error.code).toBe('test.watch_failed');
  });

  it('張った後に死んだことは、繋いでいるクライアントへも配る', () => {
    const watcher = fakeWatcher();
    const broadcast = createChangeBroadcast(watcher.integration, {
      quietMs: 10,
    });
    const got: ChangeMessage[] = [];
    broadcast.subscribe((m) => got.push(m));

    watcher.kill();

    expect(got).toEqual([{ kind: 'watch', watching: false }]);

    watcher.kill();

    expect(got, '同じ死を二度は配らない').toHaveLength(1);
  });

  it('閉じると、OS のファイル監視も外れる', () => {
    const watcher = fakeWatcher();
    const broadcast = createChangeBroadcast(watcher.integration, {
      quietMs: 10,
    });
    broadcast.subscribe(() => {});

    broadcast.close();

    expect(watcher.closed, 'OS のファイル監視を掴んだままにしない').toBe(true);
    expect(broadcast.listenerCount()).toBe(0);
  });
});
