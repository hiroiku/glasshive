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

export function createFsWatchTranscript(root: string): TranscriptWatchIntegration {
  return {
    watch({ onChange, onFail }): Observation<() => void> {
      try {
        const watcher = fs.watch(root, { recursive: true }, (_event, filename) => {
          // ファイル名の分からないイベントが来ることがある。どれが動いたか言えないので配らない
          if (filename === null) return;
          // `.jsonl` 以外のイベントも配らない。木の中には `transcript` でないものも置かれる
          if (!filename.endsWith('.jsonl')) return;
          onChange(path.join(root, filename));
        });
        /* 張った後に壊れることもある。そのときは閉じたうえで、**閉じたことを伝える** —
           黙って閉じると、そこから更新が来ないことをユーザーは知りようがない */
        watcher.on('error', (e) => {
          watcher.close();
          onFail(
            new TranscriptWatchError(`Stopped watching the transcript tree: ${root}`, {
              cause: asAppError(e),
              details: { root },
            }),
          );
        });
        return observed(() => watcher.close());
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
