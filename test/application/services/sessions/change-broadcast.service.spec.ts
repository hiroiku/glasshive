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

/** 見張りの偽物。合図を好きなときに起こせる */
function fakeWatcher() {
  let notify: ((path: string) => void) | undefined;
  let closed = false;
  const integration: TranscriptWatchIntegration = {
    watch(onChange) {
      notify = onChange;
      return observed(() => {
        closed = true;
      });
    },
  };
  return {
    integration,
    fire: (path: string) => notify?.(path),
    get closed() {
      return closed;
    },
  };
}

describe('動いたという合図を配る', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('静けさが続くまで束ね、最後に木そのものの合図を 1 度だけ添える', () => {
    const watcher = fakeWatcher();
    const broadcast = createChangeBroadcast(watcher.integration, {
      quietMs: 250,
    });
    const got: ChangeMessage[] = [];
    broadcast.subscribe((m) => got.push(m));

    watcher.fire('/a.jsonl');
    watcher.fire('/b.jsonl');
    watcher.fire('/a.jsonl'); // 同じものは 1 つに畳まれる

    expect(got, '静けさが来るまでは配らない').toEqual([]);

    vi.advanceTimersByTime(250);

    expect(got).toEqual([
      { kind: 'file', path: '/a.jsonl' },
      { kind: 'file', path: '/b.jsonl' },
      { kind: 'tree' },
    ]);
  });

  it('観るのをやめた人には、もう配らない', () => {
    const watcher = fakeWatcher();
    const broadcast = createChangeBroadcast(watcher.integration, {
      quietMs: 10,
    });
    const got: ChangeMessage[] = [];
    const stop = broadcast.subscribe((m) => got.push(m));

    expect(broadcast.listenerCount()).toBe(1);
    stop();
    expect(broadcast.listenerCount(), '去った人は数から外れる').toBe(0);

    watcher.fire('/a.jsonl');
    vi.advanceTimersByTime(10);

    expect(got, '去った後に届いてはいけない').toEqual([]);
  });

  it('1 人の窓が壊れても、他の窓へは配り続ける', () => {
    const watcher = fakeWatcher();
    const broadcast = createChangeBroadcast(watcher.integration, {
      quietMs: 10,
    });
    const got: ChangeMessage[] = [];
    broadcast.subscribe(() => {
      throw new Error('この窓は壊れている');
    });
    broadcast.subscribe((m) => got.push(m));

    watcher.fire('/a.jsonl');
    vi.advanceTimersByTime(10);

    expect(got).toEqual([{ kind: 'file', path: '/a.jsonl' }, { kind: 'tree' }]);
  });

  it('見張りを張れなかったことは、値として残る', () => {
    const broken: TranscriptWatchIntegration = {
      watch: () => unobservable(new TestError('張れませんでした')),
    };
    const broadcast = createChangeBroadcast(broken, { quietMs: 10 });

    const state = broadcast.watchState();
    expect(state.kind, '張れないことは欠落ではなく、見に行けなかったこと').toBe('unobservable');
    expect(broadcast.listenerCount(), '張れなくても観る人は受け付ける').toBe(0);
    expect(() => broadcast.subscribe(() => {})).not.toThrow();
  });

  it('閉じると、OS の見張りも外れる', () => {
    const watcher = fakeWatcher();
    const broadcast = createChangeBroadcast(watcher.integration, {
      quietMs: 10,
    });
    broadcast.subscribe(() => {});

    broadcast.close();

    expect(watcher.closed, 'OS の見張りを掴んだままにしない').toBe(true);
    expect(broadcast.listenerCount()).toBe(0);
  });
});
