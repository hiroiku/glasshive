import type { Observation } from '~/app-kernel/observation.ts';
import type { ObservationState } from '~/interface/presenters/sessions/tree.presenter.ts';

/* 探しの結果を、外の道が読む形へ写す。

   **見付からなかったことと、見に行けなかったことを分ける。** 分けないと、
   読めない正本が並んだ巣で「その語はどこにも無い」と読めてしまう。 */

export interface SearchJson {
  state: ObservationState;
  reason: string | null;
  /** 当たった正本の在り処。木の `file` と同じ字なので、そのまま突き合わせられる */
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
