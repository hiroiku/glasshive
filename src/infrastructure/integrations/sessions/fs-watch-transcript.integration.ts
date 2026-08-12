import fs from 'node:fs';
import path from 'node:path';
import { asAppError } from '~/app-kernel/error.ts';
import { type Observation, observed, unobservable } from '~/app-kernel/observation.ts';
import type { TranscriptWatchIntegration } from '~/application/ports/integrations/sessions/transcript-watch.integration.ts';
import { TranscriptWatchError } from '~/infrastructure/errors/sessions/transcript-watch.error.ts';

/* `fs.watch` のウォッチャーで `transcript` の木を見る。

   張れない機械がある(recursive を持たない実装、上限に当たった、根がまだ無い)。
   黙って監視なしで続けると、更新が止まっていることがユーザーには何も伝わらない。
   だから張れなかったことを値で返し、画面がそう言えるようにする。 */

/** 根がまだ歩けるかを確かめ直す間隔 */
const RECHECK_MS = 30_000;

/* 根を歩けるかを確かめる。無い・ディレクトリでない・読めないは、どれも例外で分かる。
   `fs.stat` だけでは「何かが在る」までしか分からず、ファイルを根にしたときに素通りする。 */
const openTree = (root: string): void => fs.opendirSync(root).closeSync();

export function createFsWatchTranscript(root: string): TranscriptWatchIntegration {
  return {
    watch({ onChange, onFail }): Observation<() => void> {
      try {
        /* 張る前に根を歩けるか見る。`fs.watch` は歩けない根にもウォッチャーを返すことがあり
           (Linux の Node 24 以降は、根が無くても返す)、**そのまま張れたことにすると、更新が
           1 度も無いことと、根を見に行けていないことが同じ絵になる**。 */
        openTree(root);
        const watcher = fs.watch(root, { recursive: true }, (_event, filename) => {
          // ファイル名の分からないイベントが来ることがある。どれが動いたか言えないので配らない
          if (filename === null) return;
          // `.jsonl` 以外のイベントも配らない。木の中には `transcript` でないものも置かれる
          if (!filename.endsWith('.jsonl')) return;
          onChange(path.join(root, filename));
        });

        let stopped = false;
        let recheck: ReturnType<typeof setInterval> | undefined;
        const stop = () => {
          stopped = true;
          clearInterval(recheck);
          watcher.close();
        };
        /* 見に行けなくなったら閉じたうえで、**閉じたことを伝える** — 黙って閉じると、
           そこから更新が来ないことをユーザーは知りようがない */
        const fail = (cause: unknown) => {
          if (stopped) return;
          stop();
          onFail(
            new TranscriptWatchError(`Stopped watching the transcript tree: ${root}`, {
              cause: asAppError(cause),
              details: { root },
            }),
          );
        };
        watcher.on('error', fail);

        /* 根が消えても `fs.watch` は何も言わない。`.jsonl` でないイベントが 1、2 度来て、
           あとは静かになるだけである。だからこちらから歩けるかを見に行く。
           このタイマーだけでプロセスを起こしておく理由は無いので `unref` する。 */
        recheck = setInterval(() => {
          try {
            openTree(root);
          } catch (e) {
            fail(e);
          }
        }, RECHECK_MS);
        recheck.unref();

        return observed(stop);
      } catch (e) {
        return unobservable(
          new TranscriptWatchError(`Could not watch the transcript tree: ${root}`, {
            cause: asAppError(e),
            details: { root },
          }),
        );
      }
    },
  };
}
