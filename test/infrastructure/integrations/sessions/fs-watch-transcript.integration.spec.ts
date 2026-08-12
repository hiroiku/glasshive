import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AppError } from '~/app-kernel/error.ts';
import type { Observation } from '~/app-kernel/observation.ts';
import { createFsWatchTranscript } from '~/infrastructure/integrations/sessions/fs-watch-transcript.integration.ts';

/* 本物の OS のイベントは待たない。`fs.watch` を差し替えて、来たことにする。

   待つと、機械ごとに違う遅れをテストの時間で埋めることになり、そこが最初に不安定になる。
   見たいのは「どのイベントを配り、壊れたときに何を伝えるか」だけである。 */

/** `fs.watch` の偽物。OS のイベントも、張った後の壊れ方も、手で起こせる */
class FakeWatcher extends EventEmitter {
  closed = false;
  close() {
    this.closed = true;
  }
}

type WatchListener = (event: string, filename: string | null) => void;

function stubWatch() {
  const watcher = new FakeWatcher();
  let listener: WatchListener | undefined;
  vi.spyOn(fs, 'watch').mockImplementation(((
    _root: string,
    _options: unknown,
    onEvent: WatchListener,
  ) => {
    listener = onEvent;
    return watcher as unknown as fs.FSWatcher;
  }) as unknown as typeof fs.watch);
  return {
    watcher,
    fire: (filename: string | null) => listener?.('change', filename),
  };
}

/** 観測できなかったときのエラーを取り出す。そうでなければテストを落とす */
function errorOf(observation: Observation<unknown>): AppError {
  if (observation.kind !== 'unobservable') {
    throw new Error(`観測できなかったと言うはずだった: ${observation.kind}`);
  }
  return observation.error;
}

/** 根は本物のディレクトリで置く。張る前に根を見るので、無い場所には張れない */
let root = '';

const handlers = () => ({ onChange: vi.fn(), onFail: vi.fn() });

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'glasshive-watch-'));
});

afterEach(() => {
  vi.restoreAllMocks();
  fs.rmSync(root, { recursive: true, force: true });
});

describe('`transcript` の木を見る', () => {
  it('`.jsonl` が動いたことだけを、絶対パスで配る', () => {
    const { fire } = stubWatch();
    const seen = handlers();

    createFsWatchTranscript(root).watch(seen);
    fire('a/session.jsonl');
    // 木の中には `transcript` でないものも置かれる
    fire('a/session.meta.json');
    // ファイル名の分からないイベントが来ることがある
    fire(null);

    expect(seen.onChange.mock.calls).toEqual([[path.join(root, 'a/session.jsonl')]]);
  });

  /* 張った後に死ぬのは珍しくない。黙って閉じると、そこから更新が来ないことを
     ユーザーは知りようがない。 */
  it('張った後に壊れたら、閉じた上で観測できなかったことを伝える', () => {
    const { watcher } = stubWatch();
    const seen = handlers();

    createFsWatchTranscript(root).watch(seen);
    watcher.emit('error', new Error('inotify watch limit reached'));

    expect(watcher.closed, 'OS のファイル監視を掴んだままにしない').toBe(true);
    expect(seen.onFail).toHaveBeenCalledTimes(1);
    const error = seen.onFail.mock.calls[0]?.[0] as AppError;
    expect(error.code).toBe('transcript.watch_unavailable');
    expect(error.message, 'どの木を見ていたかを残す').toContain(root);
  });

  it('外すと、OS のファイル監視も外れる', () => {
    const { watcher } = stubWatch();

    const started = createFsWatchTranscript(root).watch(handlers());
    if (started.kind !== 'observed') throw new Error('張れたと言うはずだった');
    started.value();

    expect(watcher.closed).toBe(true);
  });

  /* 本物の `fs.watch` に張らせる。差し替えると、**根が無くてもウォッチャーを返す実装**を
     この偽物が隠してしまい、張れていないことを言えているかが確かめられない。 */
  it('根がまだ無ければ、無かったのではなく観測できなかったと言う', () => {
    const missing = path.join(root, 'no-such-root');

    const started = createFsWatchTranscript(missing).watch(handlers());

    expect(errorOf(started).code).toBe('transcript.watch_unavailable');
  });
});
