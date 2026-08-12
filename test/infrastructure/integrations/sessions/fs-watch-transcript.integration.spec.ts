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
   見たいのは「どのイベントを配り、壊れたときに何を伝えるか」だけである。

   例外は最後の 1 つである。根の作り直しに気付けるかは、本物の `fs.watch` が親へ何を届けるかに
   丸ごと寄りかかっている —— そこを偽物で置くと、確かめているのはこちらの書き方だけになる。 */

/** `fs.watch` の偽物。OS のイベントも、張った後の壊れ方も、手で起こせる */
class FakeWatcher extends EventEmitter {
  closed = false;
  close() {
    this.closed = true;
  }
}

type WatchListener = (event: string, filename: string | null) => void;

/* 張った先ごとに別のウォッチャーを返す。根と親の両方に張るので、1 つにまとめると
   どちらへ来たイベントなのかがテストから言えなくなる。 */
function stubWatch() {
  const opened = new Map<string, { watcher: FakeWatcher; listener: WatchListener }[]>();
  vi.spyOn(fs, 'watch').mockImplementation(((
    dir: string,
    _options: unknown,
    onEvent: WatchListener,
  ) => {
    const watcher = new FakeWatcher();
    const list = opened.get(dir) ?? [];
    list.push({ watcher, listener: onEvent });
    opened.set(dir, list);
    return watcher as unknown as fs.FSWatcher;
  }) as unknown as typeof fs.watch);

  const all = (dir: string) => opened.get(dir) ?? [];
  return {
    /** その場所に張った回数。張り替えたかどうかはここに出る */
    count: (dir: string) => all(dir).length,
    /** 何番目に張ったウォッチャーか。既定はいちばん新しいもの */
    watcher: (dir: string, index = -1) => all(dir).at(index) as { watcher: FakeWatcher },
    fire: (dir: string, filename: string | null) => all(dir).at(-1)?.listener('change', filename),
  };
}

/** 観測できなかったときのエラーを取り出す。そうでなければテストを落とす */
function errorOf(observation: Observation<unknown>): AppError {
  if (observation.kind !== 'unobservable') {
    throw new Error(`観測できなかったと言うはずだった: ${observation.kind}`);
  }
  return observation.error;
}

/* 根は本物のディレクトリで置く。張る前に根を歩くので、歩けない場所には張れない。
   親も自分で作る —— 根の名前が動いたことを親から知るので、他のプログラムが書き込む
   場所を親にすると、そちらの動きがテストに混ざる。 */
let parent = '';
let root = '';

/** 根を確かめ直す間隔。実装の `RECHECK_MS` に合わせる */
const RECHECK_MS = 30_000;

const handlers = () => ({ onChange: vi.fn(), onTreeChange: vi.fn(), onFail: vi.fn() });

beforeEach(() => {
  // 確かめ直しは間隔を置いて起きるので、時計はこちらで進める
  vi.useFakeTimers();
  parent = fs.mkdtempSync(path.join(os.tmpdir(), 'glasshive-watch-'));
  root = path.join(parent, 'projects');
  fs.mkdirSync(root);
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  fs.rmSync(parent, { recursive: true, force: true });
});

describe('`transcript` の木を見る', () => {
  it('`.jsonl` が動いたことだけを、絶対パスで配る', () => {
    const stub = stubWatch();
    const seen = handlers();

    createFsWatchTranscript(root).watch(seen);
    stub.fire(root, 'a/session.jsonl');
    // 木の中には `transcript` でないものも置かれる
    stub.fire(root, 'a/session.meta.json');
    // ファイル名の分からないイベントが来ることがある
    stub.fire(root, null);

    expect(seen.onChange.mock.calls).toEqual([[path.join(root, 'a/session.jsonl')]]);
  });

  /* 張った後に死ぬのは珍しくない。黙って閉じると、そこから更新が来ないことを
     ユーザーは知りようがない。 */
  it('張った後に壊れたら、閉じた上で観測できなかったことを伝える', () => {
    const stub = stubWatch();
    const seen = handlers();

    createFsWatchTranscript(root).watch(seen);
    stub.watcher(root).watcher.emit('error', new Error('inotify watch limit reached'));

    expect(stub.watcher(root).watcher.closed, 'OS のファイル監視を掴んだままにしない').toBe(true);
    expect(seen.onFail).toHaveBeenCalledTimes(1);
    const error = seen.onFail.mock.calls[0]?.[0] as AppError;
    expect(error.code).toBe('transcript.watch_unavailable');
    expect(error.message, 'どの木を見ていたかを残す').toContain(root);
  });

  /* 外した後まで根を開き続けるのは、読むだけの glasshive が観測をやめないということである */
  it('外すと、OS のファイル監視も根の確かめ直しも止まる', () => {
    const stub = stubWatch();
    const opened = vi.spyOn(fs, 'opendirSync');

    const started = createFsWatchTranscript(root).watch(handlers());
    if (started.kind !== 'observed') throw new Error('張れたと言うはずだった');
    started.value();
    const untilStopped = opened.mock.calls.length;
    vi.advanceTimersByTime(RECHECK_MS * 3);

    expect(stub.watcher(root).watcher.closed).toBe(true);
    expect(stub.watcher(parent).watcher.closed, '親を見るほうも外す').toBe(true);
    expect(opened.mock.calls.length).toBe(untilStopped);
  });

  /* 根が消えても `fs.watch` は何も言わない。`.jsonl` でないイベントが 1、2 度来て、あとは
     静かになるだけである。**張れたままにすると、更新の来ない木を繋がっている顔で見せ続ける。** */
  it('張った後に根が消えたら、閉じた上で観測できなかったことを伝える', () => {
    const stub = stubWatch();
    const seen = handlers();

    createFsWatchTranscript(root).watch(seen);
    fs.rmSync(root, { recursive: true, force: true });
    vi.advanceTimersByTime(RECHECK_MS);

    expect(stub.watcher(root).watcher.closed, 'OS のファイル監視を掴んだままにしない').toBe(true);
    expect(seen.onFail).toHaveBeenCalledTimes(1);
    const error = seen.onFail.mock.calls[0]?.[0] as AppError;
    expect(error.code).toBe('transcript.watch_unavailable');
  });

  /* 確かめ直しが空振りを言い出すと、動いている木の上で「更新は届かない」が出る。
     そちらのほうが、黙るより読む人を惑わせる。 */
  it('根が在るかぎり、確かめ直しても何も言わない', () => {
    const stub = stubWatch();
    const seen = handlers();

    createFsWatchTranscript(root).watch(seen);
    vi.advanceTimersByTime(RECHECK_MS * 5);

    expect(seen.onFail).not.toHaveBeenCalled();
    expect(
      seen.onTreeChange,
      '同じ木を見続けているなら、入れ替わっていない',
    ).not.toHaveBeenCalled();
    expect(stub.watcher(root).watcher.closed).toBe(false);
    expect(stub.count(root), '確かめ直しのたびに張り替えない').toBe(1);
  });

  /* 伝える入口は 2 つある —— 確かめ直しと、ウォッチャー自身のエラーである。どちらが先でも
     伝えるのは 1 度でよく、**受け手が 2 度目を捨てていることに、こちら側が寄りかからない**。 */
  it('確かめ直しの後にウォッチャーも壊れたら、伝えるのは 1 度だけ', () => {
    const stub = stubWatch();
    const seen = handlers();

    createFsWatchTranscript(root).watch(seen);
    fs.rmSync(root, { recursive: true, force: true });
    vi.advanceTimersByTime(RECHECK_MS);
    stub.watcher(root).watcher.emit('error', new Error('inotify watch limit reached'));

    expect(seen.onFail).toHaveBeenCalledTimes(1);
  });

  it('外した後は、根が消えても何も言わない', () => {
    const stub = stubWatch();
    const seen = handlers();

    const started = createFsWatchTranscript(root).watch(seen);
    if (started.kind !== 'observed') throw new Error('張れたと言うはずだった');
    started.value();
    fs.rmSync(root, { recursive: true, force: true });
    vi.advanceTimersByTime(RECHECK_MS * 3);

    expect(seen.onFail, '外した先の画面へ配る相手はもう居ない').not.toHaveBeenCalled();
    expect(stub.watcher(root).watcher.closed).toBe(true);
  });

  /* 閉じたウォッチャーのイベントが 1 つ遅れて着くことはある。**そこで張り直すと、外したはずの
     glasshive が観測を続ける。** */
  it('外した後は、根が作り直されても張り直さない', () => {
    const stub = stubWatch();
    const seen = handlers();

    const started = createFsWatchTranscript(root).watch(seen);
    if (started.kind !== 'observed') throw new Error('張れたと言うはずだった');
    started.value();
    stub.fire(parent, 'projects');

    expect(stub.count(root), '外した先で OS のファイル監視を張り直している').toBe(1);
    expect(seen.onTreeChange).not.toHaveBeenCalled();
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

/* 根が消えて同じ場所に作り直されると、根に張ったウォッチャーは消えたほうを掴んだままになる。
   歩けるかを見に行っても新しいほうが開くので、確かめ直しは何も言わない —— **更新の届かない
   木を、繋がっている顔で見せ続ける。** 根の名前が動いたことは親から届く。 */
describe('根が作り直されたら、新しいほうへ張り替える', () => {
  it('新しい根へ張り直して、木が入れ替わったことを伝える', () => {
    const stub = stubWatch();
    const seen = handlers();

    createFsWatchTranscript(root).watch(seen);
    stub.fire(parent, 'projects');

    expect(stub.count(root), '新しい根へ張り直していない').toBe(2);
    expect(stub.watcher(root, 0).watcher.closed, '消えた木を掴んだままにしない').toBe(true);
    expect(stub.watcher(root, 1).watcher.closed).toBe(false);
    expect(seen.onTreeChange, '画面が持っている木は、もう在らない').toHaveBeenCalledTimes(1);
    expect(
      seen.onFail,
      '見続けられているのだから、更新が届かないとは言わない',
    ).not.toHaveBeenCalled();
  });

  /* 根そのものがファイルシステムの根なら、親は自分自身である。**同じ場所へ 2 本張らない**
     —— 名前の動きようが無いので、張っても何も知れない。 */
  it('親が自分自身なら、親は見に行かない', () => {
    const stub = stubWatch();
    const top = path.parse(root).root;

    createFsWatchTranscript(top).watch(handlers());

    expect(stub.count(top), '同じ場所へ 2 本目を張っている').toBe(1);
  });

  it('親で動いたのが別の名前なら、張り替えない', () => {
    const stub = stubWatch();
    const seen = handlers();

    createFsWatchTranscript(root).watch(seen);
    stub.fire(parent, 'settings.json');

    expect(stub.count(root), '隣で何が起きても、見ている木は入れ替わっていない').toBe(1);
    expect(seen.onTreeChange).not.toHaveBeenCalled();
  });

  /* 消えてから作り直されるまでには間が在る。**その間に「張り替えた」と言わない** ——
     言えば、まだ無い木の上で読み直しが始まる。 */
  it('根がまだ戻っていないなら、張り替えたとは言わない', () => {
    const stub = stubWatch();
    const seen = handlers();

    createFsWatchTranscript(root).watch(seen);
    fs.rmSync(root, { recursive: true, force: true });
    stub.fire(parent, 'projects');

    expect(stub.count(root)).toBe(1);
    expect(seen.onTreeChange).not.toHaveBeenCalled();
    expect(seen.onFail, '戻ってくるかもしれない。ここで言い切らない').not.toHaveBeenCalled();
  });

  it('消えたまま戻らなければ、確かめ直しが観測できなかったことを伝える', () => {
    const stub = stubWatch();
    const seen = handlers();

    createFsWatchTranscript(root).watch(seen);
    fs.rmSync(root, { recursive: true, force: true });
    stub.fire(parent, 'projects');
    vi.advanceTimersByTime(RECHECK_MS);

    expect(seen.onFail).toHaveBeenCalledTimes(1);
    const error = seen.onFail.mock.calls[0]?.[0] as AppError;
    expect(error.code).toBe('transcript.watch_unavailable');
  });

  /* 親のイベントが届かない機械でも、歩けるようになった根には張り直す。**そこで
     「観測できなかった」と言い切らない** —— 見に行ける木がそこに在る。 */
  it('親から届かなくても、戻ってきた根には確かめ直しが張り直す', () => {
    const stub = stubWatch();
    const seen = handlers();

    createFsWatchTranscript(root).watch(seen);
    fs.rmSync(root, { recursive: true, force: true });
    stub.fire(parent, 'projects');
    fs.mkdirSync(root);
    vi.advanceTimersByTime(RECHECK_MS);

    expect(stub.count(root), '戻ってきた木に張り直していない').toBe(2);
    expect(seen.onTreeChange).toHaveBeenCalledTimes(1);
    expect(seen.onFail, '歩ける木の上で「更新は届かない」と言っている').not.toHaveBeenCalled();
  });

  /* この 1 つだけは本物の `fs.watch` に張らせる。**気付けるかどうかは、OS が親へ何を届けるかに
     丸ごと寄りかかっている** —— そこを偽物で置くと、確かめているのは呼び出しの順番だけになり、
     届かない機械の上でも緑のままになる。

     作り直しは 1 度では済ませない。macOS のイベントの源は `fs.watch` が返った後に動き出すので、
     すぐ消すと、張り終える前の動きとして落ちることがある。届くまで作り直し続ければ、機械の
     速さで待ち時間を決めずに済む。 */
  it('本物のウォッチャーでも、作り直しは親から届く', async () => {
    vi.useRealTimers();
    const seen = handlers();

    const started = createFsWatchTranscript(root).watch(seen);
    if (started.kind !== 'observed') throw new Error('張れたと言うはずだった');
    try {
      const deadline = Date.now() + 10_000;
      while (seen.onTreeChange.mock.calls.length === 0) {
        if (Date.now() > deadline) throw new Error('親からのイベントが届かなかった');
        fs.rmSync(root, { recursive: true, force: true });
        fs.mkdirSync(root);
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
    } finally {
      started.value();
    }

    expect(seen.onFail, '歩ける木に張り直せたのだから、更新は届く').not.toHaveBeenCalled();
  }, 20_000);
});
