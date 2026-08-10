import type { Observation } from '~/app-kernel/observation.ts';
import type { TranscriptSearchPage } from '~/application/use-cases/sessions/search-transcripts.use-case.ts';
import type { ObservationState } from '~/interface/presenters/sessions/tree.presenter.ts';

/* 検索の結果を、外部 API が読む形へ写す。

   **見付からなかったことと、観測できなかったことを分ける。** 分けないと、
   読めない `transcript` が並んだプロジェクトで「その語はどこにも無い」と読めてしまう。 */

export interface SearchJson {
  state: ObservationState;
  reason: string | null;
  /** 当たった `transcript` のパス。木の `file` と同じ文字列なので、そのまま突き合わせられる */
  files: string[];
  /** ここまでに開いた本数。次の回はこの位置から頼む */
  scanned: number;
  /** 候補の総数 */
  total: number;
  /** 候補を最後まで開いたか */
  done: boolean;
}

export function presentSearch(found: Observation<TranscriptSearchPage>): SearchJson {
  if (found.kind !== 'observed') {
    /* 観測できなかった回を `done` にしない。読み切ったことにすると、開けなかった
       `transcript` の中の当たりが「無かった」ものとして消える。 */
    return {
      state: found.kind,
      reason: found.kind === 'absent' ? found.reason : found.error.code,
      files: [],
      scanned: 0,
      total: 0,
      done: false,
    };
  }
  return {
    state: 'observed',
    reason: null,
    files: [...found.value.files],
    scanned: found.value.scanned,
    total: found.value.total,
    done: found.value.done,
  };
}
