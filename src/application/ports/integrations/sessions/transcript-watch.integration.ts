import type { AppError } from '~/app-kernel/error.ts';
import type { Observation } from '~/app-kernel/observation.ts';

export type Unsubscribe = () => void;

/* `transcript` の木が動いたことを知るポート。

   repository ではなく integration に置いている。読むのは記録ではなく **OS の仕組み**
   (inotify / FSEvents)で、失敗の仕方も「その機械では使えない」という形になるからである。
   使える機械と使えない機械があるので、ポートは `Observation` を返す — 使えないことは
   `absent` ではなく `unobservable` であり、画面は更新が届かないことを言えるべきである。

   張れた後で死ぬこともあり、そちらは戻り値では表せない。だから `onFail` を受け取る —
   張れなかったことと、張った後で死んだことは、画面から見れば同じ「更新が届かない」である。 */

export interface TranscriptWatchHandlers {
  /** `transcript` が動いた。渡すのは絶対パス */
  onChange(absolutePath: string): void;
  /** 張った後にウォッチャーが死んだ。ここから先は変更通知が来ない */
  onFail(error: AppError): void;
}

export interface TranscriptWatchIntegration {
  watch(handlers: TranscriptWatchHandlers): Observation<Unsubscribe>;
}
