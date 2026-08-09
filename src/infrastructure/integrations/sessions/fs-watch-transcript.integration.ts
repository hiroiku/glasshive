import fs from 'node:fs';
import path from 'node:path';
import { asAppError } from '~/app-kernel/error.ts';
import { type Observation, observed, unobservable } from '~/app-kernel/observation.ts';
import type { TranscriptWatchIntegration } from '~/application/ports/integrations/sessions/transcript-watch.integration.ts';
import { TranscriptWatchError } from '~/infrastructure/errors/sessions/transcript-watch.error.ts';

/* OS の見張りで正本の木を見る。

   張れない機械がある(recursive を持たない実装、上限に当たった、根がまだ無い)。
   旧実装はそのとき黙って「更新なしで続行」と出すだけだったが、観る人には何も伝わらない。
   ここでは張れなかったことを値で返し、画面がそう言えるようにする。 */

export function createFsWatchTranscript(root: string): TranscriptWatchIntegration {
  return {
    watch(onChange): Observation<() => void> {
      try {
        const watcher = fs.watch(root, { recursive: true }, (_event, filename) => {
          // 名前の分からない物音がある。どれが動いたか言えないので配らない
          if (filename === null) return;
          // 正本以外の物音も配らない。木の中には正本でないものも置かれる
          if (!filename.endsWith('.jsonl')) return;
          onChange(path.join(root, filename));
        });
        // 張った後に壊れることもある。そのときは黙る以外にできることが無い
        watcher.on('error', () => watcher.close());
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
