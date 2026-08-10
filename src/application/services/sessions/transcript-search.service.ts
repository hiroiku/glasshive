import { type Observation, observed } from '~/app-kernel/observation.ts';
import type { TranscriptRepository } from '~/application/ports/repositories/sessions/transcript.repository.ts';
import { SEARCH_TAIL_BYTES } from '~/domain/value-objects/sessions/observation-window.value-object.ts';

/* 直近に動いた `transcript` の末尾から、語を含むものを探す。

   末尾しか見ないのは、検索の目的が「いま何が起きているか」だからである。
   対象期間より前に書き終わった `transcript` は、開くだけ無駄なので触らない。

   語は小文字に正規化してから渡すこと。正規化する位置を呼ぶ側に置いてあるのは、1 度の検索で
   何百の `transcript` を当てるからで、`transcript` ごとに正規化し直す理由が無い。 */

export interface TranscriptSearchService {
  /** 当たった `transcript` のパス。**開いた数ではなく、当たった数で打ち切る** */
  findTails(
    files: readonly string[],
    lowerQuery: string,
    options: { readonly sinceMs: number; readonly limit: number },
  ): Promise<Observation<readonly string[]>>;
}

export function createTranscriptSearch(deps: {
  readonly transcripts: TranscriptRepository;
}): TranscriptSearchService {
  const { transcripts } = deps;

  return {
    async findTails(files, lowerQuery, { sinceMs, limit }) {
      const found: string[] = [];
      for (const file of files) {
        if (found.length >= limit) break;
        const stat = await transcripts.statTranscript(file);
        /* 大きさを観測できなかった `transcript` を黙って飛ばすと、その中の当たりが
           「無かった」として消える。開けなかったときと同じに扱う。 */
        if (stat.kind === 'unobservable') return stat;
        // 消えた `transcript` には当たりようがない。検索はそのまま続けられる
        if (stat.kind === 'absent') continue;
        // 対象期間より前に書き終わった `transcript` は開かない
        if (stat.value.mtimeMs < sinceMs) continue;
        const tail = await transcripts.readTail(
          {
            file,
            mtimeMs: stat.value.mtimeMs,
            sizeBytes: stat.value.sizeBytes,
          },
          // 語はテキストのまま当てる。行として読まないので、端で切れた行も繕わない
          { maxBytes: SEARCH_TAIL_BYTES, trimPartialLine: false },
        );
        /* 読めない `transcript` が 1 つでもあれば、検索そのものを観測できなかったことにする。
           見付からなかったのか、観測できなかったのかを取り違えさせない。 */
        if (tail.kind === 'unobservable') return tail;
        if (tail.kind === 'absent') continue;
        if (tail.value.text.toLowerCase().includes(lowerQuery)) found.push(file);
      }
      return observed(found);
    },
  };
}
