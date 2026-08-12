import type { Observation } from '~/app-kernel/observation.ts';
import type { Locale } from '~/application/i18n/locale.ts';
import type { PreferencesView } from '~/application/use-cases/workspace/read-preferences.use-case.ts';
import { iso } from '~/interface/presenters/sessions/tree.presenter.ts';

/* 観ると決めたものを、外部 API が読む形へ写す。

   写すだけである。並べ替えも絞りもここではしない — どちらも導出の仕事で、
   ここでやると同じ判断が二か所に散る。

   見るのは use-case が出した形だけである。内側の名前を直に覗くと、
   内側を組み替えたときに外へ出す形まで一緒に動いてしまう。 */

/** `preferences.json` をどう読めたか。`Observation` の三つの状態と同じ文字列を使う */
export interface StoredStatusJson {
  state: 'observed' | 'absent' | 'unobservable';
  /** 観測できなかった理由。観測できたときは理由が無いので `null` */
  reason: string | null;
}

export interface PreferencesJson {
  /* 観ると決めたディレクトリの絶対パス。観測できていない場所もここには残る。
   **並びがそのまま表示の順である。** */
  watched: string[];
  /* タブに出す id。**`watched` のコピーではない。** 観測していない場所は出ないので、
     両方を出さないと「記録してあるのにタブが無い」理由が受け取る側から見えなくなる。 */
  visible_tabs: string[];
  /* 選ばれた画面の言葉。**まだ選んでいなければ `null` である。**
     `"en"` に倒して写すと、選んでいない人の画面がブラウザーの言葉を見に行けなくなる。 */
  locale: Locale | null;
  /* `preferences.json` を読めたか。既定へ倒れたとき、無かったのか観測できなかったのかを分ける。
     どちらも「まだ何も観ていない」ように見えるので、この欄でしか見分けられない。 */
  stored: StoredStatusJson;
  /* 見つけたが、まだ記録していないディレクトリ。**選び直すための一覧である。**
     ここに出さないと、Claude Code を走らせたことのあるディレクトリを画面から選べない。 */
  candidates: CandidateJson[];
}

/** まだ記録していないディレクトリ 1 つ。記録するときに名指すのは `id` である */
export interface CandidateJson {
  id: string;
  name: string;
  /* 見えた作業ディレクトリ。**読めていなければ `null`。** 名前から起こすと、
     当てずっぽうが場所として並ぶ。 */
  path: string | null;
  /** 最後に動いた時刻。「最近まで動いていたか」を読むためだけに出す */
  last_activity: string;
}

/** 記録していないディレクトリ 1 つ。写す前の形 */
export interface CandidateView {
  readonly id: string;
  readonly name: string;
  readonly path: string | null;
  readonly latestActivityMs: number;
}

const reasonOf = <T>(observation: Observation<T>): string | null => {
  if (observation.kind === 'absent') return observation.reason;
  if (observation.kind === 'unobservable') return observation.error.code;
  return null;
};

export function presentPreferences(
  view: PreferencesView,
  candidates: readonly CandidateView[] = [],
): PreferencesJson {
  return {
    watched: [...view.watched.paths],
    visible_tabs: [...view.visibleTabs],
    locale: view.locale,
    stored: { state: view.stored.kind, reason: reasonOf(view.stored) },
    /* 新しく動いたものから並べる。**選ぶ人が探しているのは、たいてい直前まで居た場所である。** */
    candidates: [...candidates]
      .sort((a, b) => b.latestActivityMs - a.latestActivityMs)
      .map((candidate) => ({
        id: candidate.id,
        name: candidate.name,
        path: candidate.path,
        last_activity: iso(candidate.latestActivityMs),
      })),
  };
}
