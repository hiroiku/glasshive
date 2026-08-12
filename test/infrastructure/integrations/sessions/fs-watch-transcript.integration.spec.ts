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

/** 根は本物のディレクトリで置く。張る前に根を歩くので、歩けない場所には張れない */
let root = '';

/** 根を確かめ直す間隔。実装の `RECHECK_MS` に合わせる */
const RECHECK_MS = 30_000;

const handlers = () => ({ onChange: vi.fn(), onFail: vi.fn() });

beforeEach(() => {
  // 確かめ直しは間隔を置いて起きるので、時計はこちらで進める
  vi.useFakeTimers();
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'glasshive-watch-'));
});

afterEach(() => {
  vi.useRealTimers();
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

  /* 外した後まで根を開き続けるのは、読むだけの glasshive が観測をやめないということである */
  it('外すと、OS のファイル監視も根の確かめ直しも止まる', () => {
    const { watcher } = stubWatch();
    const opened = vi.spyOn(fs, 'opendirSync');

    const started = createFsWatchTranscript(root).watch(handlers());
    if (started.kind !== 'observed') throw new Error('張れたと言うはずだった');
    started.value();
    const untilStopped = opened.mock.calls.length;
    vi.advanceTimersByTime(RECHECK_MS * 3);

    expect(watcher.closed).toBe(true);
    expect(opened.mock.calls.length).toBe(untilStopped);
  });

  /* 根が消えても `fs.watch` は何も言わない。`.jsonl` でないイベントが 1、2 度来て、あとは
     静かになるだけである。**張れたままにすると、更新の来ない木を繋がっている顔で見せ続ける。** */
  it('張った後に根が消えたら、閉じた上で観測できなかったことを伝える', () => {
    const { watcher } = stubWatch();
    const seen = handlers();

    createFsWatchTranscript(root).watch(seen);
    fs.rmSync(root, { recursive: true, force: true });
    vi.advanceTimersByTime(RECHECK_MS);

    expect(watcher.closed, 'OS のファイル監視を掴んだままにしない').toBe(true);
    expect(seen.onFail).toHaveBeenCalledTimes(1);
    const error = seen.onFail.mock.calls[0]?.[0] as AppError;
    expect(error.code).toBe('transcript.watch_unavailable');
  });

  /* 確かめ直しが空振りを言い出すと、動いている木の上で「更新は届かない」が出る。
     そちらのほうが、黙るより読む人を惑わせる。 */
  it('根が在るかぎり、確かめ直しても何も言わない', () => {
    const { watcher } = stubWatch();
    const seen = handlers();

    createFsWatchTranscript(root).watch(seen);
    vi.advanceTimersByTime(RECHECK_MS * 5);

    expect(seen.onFail).not.toHaveBeenCalled();
    expect(watcher.closed).toBe(false);
  });

  /* 伝える入口は 2 つある —— 確かめ直しと、ウォッチャー自身のエラーである。どちらが先でも
     伝えるのは 1 度でよく、**受け手が 2 度目を捨てていることに、こちら側が寄りかからない**。 */
  it('確かめ直しの後にウォッチャーも壊れたら、伝えるのは 1 度だけ', () => {
    const { watcher } = stubWatch();
    const seen = handlers();

    createFsWatchTranscript(root).watch(seen);
    fs.rmSync(root, { recursive: true, force: true });
    vi.advanceTimersByTime(RECHECK_MS);
    watcher.emit('error', new Error('inotify watch limit reached'));

    expect(seen.onFail).toHaveBeenCalledTimes(1);
  });

  it('外した後は、根が消えても何も言わない', () => {
    const { watcher } = stubWatch();
    const seen = handlers();

    const started = createFsWatchTranscript(root).watch(seen);
    if (started.kind !== 'observed') throw new Error('張れたと言うはずだった');
    started.value();
    fs.rmSync(root, { recursive: true, force: true });
    vi.advanceTimersByTime(RECHECK_MS * 3);

    expect(seen.onFail, '外した先の画面へ配る相手はもう居ない').not.toHaveBeenCalled();
    expect(watcher.closed).toBe(true);
  });

  /* ここから 2 つは本物の `fs.watch` に張らせる。差し替えると、**歩けない根にも
     ウォッチャーを返す実装**をこの偽物が隠してしまい、張れていないことを言えているかが
     確かめられない。 */
  it('根がまだ無ければ、無かったのではなく観測できなかったと言う', () => {
    const missing = path.join(root, 'no-such-root');

    const started = createFsWatchTranscript(missing).watch(handlers());

    expect(errorOf(started).code).toBe('transcript.watch_unavailable');
  });

  /* ファイルの上にも `fs.watch` は張れてしまう。張ると、配るパスが根の名前を自分自身に
     継ぎ足したものになり、在りもしない `transcript` の変更として出ていく。 */
  it('根がディレクトリでなければ、張れたことにしない', () => {
    const file = path.join(root, 'not-a-tree');
    fs.writeFileSync(file, '');

    const started = createFsWatchTranscript(file).watch(handlers());

    expect(errorOf(started).code).toBe('transcript.watch_unavailable');
  });
});
