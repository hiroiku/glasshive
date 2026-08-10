import { type Observation, observed } from '~/app-kernel/observation.ts';
import type { TranscriptRepository } from '~/application/ports/repositories/sessions/transcript.repository.ts';
import { SEARCH_TAIL_BYTES } from '~/domain/value-objects/sessions/observation-window.value-object.ts';

/* 直近に動いた `transcript` の末尾から、語を含むものを探す。

   末尾しか見ないのは、検索の目的が「いま何が起きているか」だからである。
   対象期間より前に書き終わった `transcript` は、開くだけ無駄なので触らない。

   1 回で全部は読まない。候補を並べておいて、そのうち `scan` 本だけを開き、どこまで開いたかを
   返す。呼ぶ側は続きの位置から次を頼む。**並びは開く前に決める** — 開いた順に並べると、
   区切りをまたいだときに同じ `transcript` を二度開いたり、飛ばしたりする。

   語は小文字に正規化してから渡すこと。正規化する位置を呼ぶ側に置いてあるのは、1 度の検索で
   何百の `transcript` を当てるからで、`transcript` ごとに正規化し直す理由が無い。 */

/** 検索を区切って読んだ 1 回ぶん */
export interface TranscriptSearchPage {
  /** この回で中身が当たった `transcript` のパス */
  readonly files: readonly string[];
  /** ここまでに開いた本数。次の回はここから続ける */
  readonly scanned: number;
  /** 候補の総数。対象期間の中に在る `transcript` の本数 */
  readonly total: number;
  /** 候補を最後まで開いたか */
  readonly done: boolean;
}

export interface TranscriptSearchOptions {
  readonly sinceMs: number;
  /** 候補の何本目から開くか */
  readonly offset: number;
  /** この回で開く本数 */
  readonly scan: number;
  /** この回で返す当たりの数の上限。**開いた数ではなく、当たった数で打ち切る** */
  readonly limit: number;
}

/** 開く前に並べる相手。並べるための時刻と、末尾を読むための大きさを併せ持つ */
interface Candidate {
  readonly file: string;
  readonly mtimeMs: number;
  readonly sizeBytes: number;
}

/* 新しい順、同着はパスの辞書順。**並べ替えは全順序でなければならない。**
   同着の順が実行ごとに揺れると、区切りをまたいだときに取りこぼしと重複が出る。 */
function byRecency(a: Candidate, b: Candidate): number {
  if (a.mtimeMs !== b.mtimeMs) return b.mtimeMs - a.mtimeMs;
  return a.file < b.file ? -1 : a.file > b.file ? 1 : 0;
}

export interface TranscriptSearchService {
  findTails(
    files: readonly string[],
    lowerQuery: string,
    options: TranscriptSearchOptions,
  ): Promise<Observation<TranscriptSearchPage>>;
}

export function createTranscriptSearch(deps: {
  readonly transcripts: TranscriptRepository;
}): TranscriptSearchService {
  const { transcripts } = deps;

  return {
    async findTails(files, lowerQuery, { sinceMs, offset, scan, limit }) {
      const candidates: Candidate[] = [];
      for (const file of files) {
        const stat = await transcripts.statTranscript(file);
        /* 大きさを観測できなかった `transcript` を黙って飛ばすと、その中の当たりが
           「無かった」として消える。開けなかったときと同じに扱う。 */
        if (stat.kind === 'unobservable') return stat;
        // 消えた `transcript` には当たりようがない。検索はそのまま続けられる
        if (stat.kind === 'absent') continue;
        // 対象期間より前に書き終わった `transcript` は開かない
        if (stat.value.mtimeMs < sinceMs) continue;
        candidates.push({
          file,
          mtimeMs: stat.value.mtimeMs,
          sizeBytes: stat.value.sizeBytes,
        });
      }
      candidates.sort(byRecency);

      const found: string[] = [];
      // 候補の外を指されても、開いた本数が総数を超えることはない
      let at = Math.min(Math.max(offset, 0), candidates.length);
      const stop = Math.min(candidates.length, at + Math.max(scan, 1));
      while (at < stop && found.length < limit) {
        const candidate = candidates[at];
        at += 1;
        if (candidate === undefined) continue;
        const tail = await transcripts.readTail(
          {
            file: candidate.file,
            mtimeMs: candidate.mtimeMs,
            sizeBytes: candidate.sizeBytes,
          },
          // 語はテキストのまま当てる。行として読まないので、端で切れた行も繕わない
          { maxBytes: SEARCH_TAIL_BYTES, trimPartialLine: false },
        );
        /* 読めない `transcript` が 1 つでもあれば、この回を観測できなかったことにする。
           見付からなかったのか、観測できなかったのかを取り違えさせない。 */
        if (tail.kind === 'unobservable') return tail;
        if (tail.kind === 'absent') continue;
        if (tail.value.text.toLowerCase().includes(lowerQuery)) found.push(candidate.file);
      }

      return observed({
        files: found,
        scanned: at,
        total: candidates.length,
        done: at >= candidates.length,
      });
    },
  };
}
