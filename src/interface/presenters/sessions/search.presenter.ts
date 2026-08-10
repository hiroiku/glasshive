import type { Observation } from '~/app-kernel/observation.ts';
import type { ObservationState } from '~/interface/presenters/sessions/tree.presenter.ts';

/* 検索の結果を、外部 API が読む形へ写す。

   **見付からなかったことと、観測できなかったことを分ける。** 分けないと、
   読めない `transcript` が並んだプロジェクトで「その語はどこにも無い」と読めてしまう。 */

export interface SearchJson {
  state: ObservationState;
  reason: string | null;
  /** 当たった `transcript` のパス。木の `file` と同じ文字列なので、そのまま突き合わせられる */
  files: string[];
}

export function presentSearch(found: Observation<readonly string[]>): SearchJson {
  if (found.kind !== 'observed') {
    return {
      state: found.kind,
      reason: found.kind === 'absent' ? found.reason : found.error.code,
      files: [],
    };
  }
  return { state: 'observed', reason: null, files: [...found.value] };
}
