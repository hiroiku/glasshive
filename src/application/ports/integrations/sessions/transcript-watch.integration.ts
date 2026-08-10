import type { Observation } from '~/app-kernel/observation.ts';

export type Unsubscribe = () => void;

/* `transcript` の木が動いたことを知るポート。

   repository ではなく integration に置いている。読むのは記録ではなく **OS の仕組み**
   (inotify / FSEvents)で、失敗の仕方も「その機械では使えない」という形になるからである。
   使える機械と使えない機械があるので、ポートは `Observation` を返す — 使えないことは
   `absent` ではなく `unobservable` であり、画面は更新が届かないことを言えるべきである。 */

export interface TranscriptWatchIntegration {
  watch(onChange: (absolutePath: string) => void): Observation<Unsubscribe>;
}
