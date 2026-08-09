import { type Observation, observed } from '~/app-kernel/observation.ts';
import type {
  TranscriptWatchIntegration,
  Unsubscribe,
} from '~/application/ports/integrations/sessions/transcript-watch.integration.ts';

/* 動いたという合図を、観ている人みんなへ配る。

   見張りは **この道具に 1 つだけ** 持つ。窓ごとに張ると、画面を開け閉てするたびに
   OS の見張りが増え、やがて機械が張れる数の上限に当たる — そのとき壊れるのは
   最後に開いた窓ではなく、たまたま次に張ろうとした誰かである。

   250 ミリ秒の静けさで束ねるのは旧実装から引き継いだ判断。エージェントは 1 つの返答を
   書くあいだに正本へ何度も追記するので、その 1 回ずつを配ると、観る人の画面は
   落ち着きなく描き直され続ける。 */

export type ChangeMessage = { readonly kind: 'file'; readonly path: string } | { kind: 'tree' };

const QUIET_MS = 250;
const MAX_FILES_PER_FLUSH = 20;

type Listener = (message: ChangeMessage) => void;

export interface ChangeBroadcastService {
  subscribe(listener: Listener): Unsubscribe;
  /** いま何人が観ているか。見張りが漏れていないことを検査から確かめるために置く */
  listenerCount(): number;
  /** 見張りを張れたか。張れていなければ、画面は「更新は届かない」と言える */
  watchState(): Observation<true>;
  close(): void;
}

export function createChangeBroadcast(
  watcher: TranscriptWatchIntegration,
  options: { quietMs?: number } = {},
): ChangeBroadcastService {
  const quietMs = options.quietMs ?? QUIET_MS;
  const listeners = new Set<Listener>();
  const pending = new Set<string>();
  let timer: ReturnType<typeof setTimeout> | undefined;

  const flush = () => {
    timer = undefined;
    const paths = [...pending].slice(0, MAX_FILES_PER_FLUSH);
    pending.clear();
    for (const path of paths) emit({ kind: 'file', path });
    // 木そのものも変わったかもしれない。件数を絞った後でも、これは 1 度だけ配る
    emit({ kind: 'tree' });
  };

  const emit = (message: ChangeMessage) => {
    for (const listener of listeners) {
      try {
        listener(message);
      } catch {
        /* 1 人の窓が壊れても、他の窓へは配り続ける */
      }
    }
  };

  const started = watcher.watch((absolutePath) => {
    pending.add(absolutePath);
    if (timer === undefined) timer = setTimeout(flush, quietMs);
  });

  const unwatch: Unsubscribe | undefined = started.kind === 'observed' ? started.value : undefined;

  /* 張れたかどうかだけを外へ渡す。外し方(unwatch)は渡さない —
     見張りを外してよいのは、この道具を畳むときだけである */
  const state: Observation<true> = started.kind === 'observed' ? observed(true) : started;

  return {
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    listenerCount: () => listeners.size,
    watchState: () => state,
    close() {
      if (timer !== undefined) clearTimeout(timer);
      timer = undefined;
      listeners.clear();
      unwatch?.();
    },
  };
}
