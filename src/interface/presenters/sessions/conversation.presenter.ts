import type { Observation } from '~/app-kernel/observation.ts';
import type {
  ConversationBlock,
  ConversationEvent,
  ConversationPage,
} from '~/application/use-cases/sessions/read-conversation.use-case.ts';
import type { ObservationState } from '~/interface/presenters/sessions/tree.presenter.ts';

/* 会話 1 頁を、外の道が読む形へ写す。

   バイトの位置をそのまま外へ出すのは、次の頁を求めるのが観る側だからである。
   位置を隠すと、追記され続ける正本を同じ場所から読み直す手立てが無くなる。 */

export interface BlockJson {
  kind: ConversationBlock['kind'];
  /** 道具の名前。名前を持たない塊では `null` */
  name: string | null;
  text: string;
}

export interface EventJson {
  role: ConversationEvent['role'];
  /** 正本に書かれていた字面そのまま */
  ts: string | null;
  blocks: BlockJson[];
}

export interface EventPageJson {
  /** 読めたか。**読めなかったことを空の頁で表さない** */
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

/* 見に行けたが無かった正本は、位置の無い空の頁にする。

   0 を置くのは、そこから先を求める道が無いことを示すためである。`eof: true` と併せると、
   観る側は「もう読むものが無い」と読む — 実際そのとおりで、消えた正本には続きが無い。 */
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
