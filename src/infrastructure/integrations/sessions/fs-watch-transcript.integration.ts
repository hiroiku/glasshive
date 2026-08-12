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
  /* 根が消えて同じ場所に作り直されたことは、根に張ったウォッチャーには届かない —— 掴んでいる
     のは消えたほうのディレクトリで、新しいほうで何が起きても静かなままである。歩けるかを
     見に行っても新しいほうが開くだけで、見分けは付かない。inode も答えにならない —— Linux は
     空いた番号を作り直したディレクトリに配り直すので、比べても同じ番号が返る。

     だから根の名前が動くところ、つまり親を見る。親へ根の名前の `rename` が届くのは根そのものが
     作られた・消えたときだけで、木の中で何が起きても届かない —— macOS でも Linux でもそうである。 */
  const parent = path.dirname(root);
  const base = path.basename(root);

  return {
    watch({ onChange, onTreeChange, onFail }): Observation<() => void> {
      let stopped = false;
      let tree: fs.FSWatcher | null = null;
      let entry: fs.FSWatcher | null = null;
      let recheck: ReturnType<typeof setInterval> | undefined;

      const stop = () => {
        stopped = true;
        clearInterval(recheck);
        tree?.close();
        tree = null;
        entry?.close();
        entry = null;
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

      /* 張る前に根を歩けるか見る。`fs.watch` は歩けない根にもウォッチャーを返すことがあり
         (Linux の Node 24 以降は、根が無くても返す)、**そのまま張れたことにすると、更新が
         1 度も無いことと、根を見に行けていないことが同じ絵になる**。 */
      const attach = () => {
        openTree(root);
        const watcher = fs.watch(root, { recursive: true }, (_event, filename) => {
          // ファイル名の分からないイベントが来ることがある。どれが動いたか言えないので配らない
          if (filename === null) return;
          // `.jsonl` 以外のイベントも配らない。木の中には `transcript` でないものも置かれる
          if (!filename.endsWith('.jsonl')) return;
          onChange(path.join(root, filename));
        });
        watcher.on('error', fail);
        tree = watcher;
      };

      /** 新しい根へ張り替えて、木が入れ替わったことを伝える。張れなければ投げる */
      const reattach = () => {
        tree?.close();
        tree = null;
        attach();
        onTreeChange();
      };

      try {
        attach();
      } catch (e) {
        return unobservable(
          new TranscriptWatchError(`Could not watch the transcript tree: ${root}`, {
            cause: asAppError(e),
            details: { root },
          }),
        );
      }

      /* 親に張れない機械では、作り直しに気付けないまま木そのものは見続ける。張れないことは
         木を見る妨げにならないので、ここで観測をやめない。 */
      if (parent !== root) {
        try {
          const watcher = fs.watch(parent, { recursive: false }, (_event, filename) => {
            if (stopped || filename !== base) return;
            try {
              reattach();
            } catch {
              /* 根はまだ戻っていない。歩けるようになったかは確かめ直しが見に行く */
            }
          });
          watcher.on('error', () => {
            watcher.close();
            entry = null;
          });
          entry = watcher;
        } catch {
          /* 親を見られない。作り直しに気付けなくなるだけで、木は見続ける */
        }
      }

      /* 根が消えても `fs.watch` は何も言わない。`.jsonl` でないイベントが 1、2 度来て、
         あとは静かになるだけである。だからこちらから歩けるかを見に行く。
         このタイマーだけでプロセスを起こしておく理由は無いので `unref` する。 */
      recheck = setInterval(() => {
        try {
          openTree(root);
          // 消えた根へ張り直せていないなら、歩けるようになったここで張る
          if (tree === null) reattach();
        } catch (e) {
          fail(e);
        }
      }, RECHECK_MS);
      recheck.unref();

      return observed(stop);
    },
  };
}
