import type { Observation } from '~/app-kernel/observation.ts';
import type {
  ConversationBlock,
  ConversationEvent,
  ConversationPage,
} from '~/application/use-cases/sessions/read-conversation.use-case.ts';
import type { ObservationState } from '~/interface/presenters/sessions/tree.presenter.ts';

/* 会話 1 ページを、外部 API が読む形へ写す。

   バイトの位置をそのまま外へ出すのは、次のページを求めるのがクライアントだからである。
   位置を隠すと、追記され続ける `transcript` を同じ場所から読み直す手立てが無くなる。 */

export interface BlockJson {
  kind: ConversationBlock['kind'];
  /** ツールの名前。名前を持たないブロックでは `null` */
  name: string | null;
  text: string;
}

export interface EventJson {
  role: ConversationEvent['role'];
  /** `transcript` に書かれていた表記そのまま */
  ts: string | null;
  blocks: BlockJson[];
}

export interface EventPageJson {
  /** 読めたか。**読めなかったことを空のページで表さない** */
  state: ObservationState;
  reason: string | null;
  /** 実際に読み始めた位置。行の頭へ揃えた後の値 */
  start: number;
  /** 次に求めるべき位置。書き込み途中の行はここに含まれない */
  next: number;
  eof: boolean;
  size: number;
  events: EventJson[];
}

const presentBlock = (block: ConversationBlock): BlockJson => ({
  kind: block.kind,
  name: block.kind === 'tool_use' || block.kind === 'system' ? block.name : null,
  text: block.text,
});

const presentEvent = (event: ConversationEvent): EventJson => ({
  role: event.role,
  ts: event.ts,
  blocks: event.blocks.map(presentBlock),
});

/* 観測はできたが無かった `transcript` は、位置の無い空のページにする。

   0 を置くのは、そこから先を求める手立てが無いことを示すためである。`eof: true` と
   併せると、クライアントは「もう読むものが無い」と読む — 実際そのとおりで、
   消えた `transcript` には続きが無い。 */
export function presentConversation(page: Observation<ConversationPage>): EventPageJson {
  if (page.kind !== 'observed') {
    return {
      state: page.kind,
      reason: page.kind === 'absent' ? page.reason : page.error.code,
      start: 0,
      next: 0,
      eof: true,
      size: 0,
      events: [],
    };
  }
  return {
    state: 'observed',
    reason: null,
    start: page.value.start,
    next: page.value.next,
    eof: page.value.eof,
    size: page.value.size,
    events: page.value.items.map(presentEvent),
  };
}
