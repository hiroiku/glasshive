import type {
  ObservationState,
  ProjectJson,
} from '~/interface/presenters/sessions/tree.presenter.ts';

/* プロジェクトの `transcript` を、どこまで数え上げられたか。

   **プロジェクトのディレクトリと、セッションごとの子のディレクトリの両方を見る。** 木の中では
   `project.sources` と `session.sources` に分かれているが、数え方から見れば「出ている数が
   これで全部か」という同じ 1 つの事実である。

   画面ごとに書くと、タブと表と一覧と統計フッターが同じプロジェクトについて別の答えを出す。 */

export const sourcesStateOf = (project: ProjectJson): ObservationState =>
  project.sources.state === 'unobservable' ||
  project.sessions.some((session) => session.sources.state === 'unobservable')
    ? 'unobservable'
    : project.sources.state;

/* 出ている数を「これで全部」と言えるか。言えないなら、その数に `+?` を添える。

   **「無かった」を数え上げられなかったことに混ぜない。** ディレクトリが無かったプロジェクトは
   歩き切った上でセッションが 0 なので、その 0 は言い切ってよい数である。 */
export const counted = (project: ProjectJson): boolean =>
  sourcesStateOf(project) !== 'unobservable';
