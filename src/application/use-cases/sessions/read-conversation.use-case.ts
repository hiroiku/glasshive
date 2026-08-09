import type { Observation } from '~/app-kernel/observation.ts';
import { err, ok, type Result } from '~/app-kernel/result.ts';
import { TranscriptOutOfScopeError } from '~/application/errors/workspace/out-of-scope.error.ts';
import type {
  TranscriptEventsRepository,
  TranscriptPage,
} from '~/application/ports/repositories/sessions/transcript-events.repository.ts';
import type { TreeSnapshotService } from '~/application/services/sessions/tree-snapshot.service.ts';
import {
  allowsTranscript,
  fromTree,
} from '~/application/services/workspace/readable-scope.service.ts';
import type { ConversationEvent } from '~/domain/entities/sessions/conversation-event.entity.ts';
import { reduceEvent } from '~/domain/services/sessions/conversation.service.ts';
import {
  MAX_CHUNK_BYTES,
  MAX_EVENTS,
  READ_BLOCK_BYTES,
  TAIL_WINDOW_BYTES,
} from '~/domain/value-objects/sessions/event-page.value-object.ts';

/* 会話を 1 頁ぶん読む。

   **開いてよいのは、いまの一覧が実際に観測した正本だけである。** 判定は集合帰属で行う。
   前方一致で見ると、観測した正本の隣に置かれただけの別のファイルが「中にある」ことになる。

   頁の広さと上限は domain の値をそのまま口へ渡す。実装は言われたとおりに開くだけで、
   どこまで読むかを自分では決めない。 */

export type {
  ConversationBlock,
  ConversationEvent,
  ConversationRole,
} from '~/domain/entities/sessions/conversation-event.entity.ts';

export type ConversationPage = TranscriptPage<ConversationEvent>;

export interface ConversationRequest {
  readonly file: string;
  /** 読み始める位置。`null` なら末尾の窓 */
  readonly from: number | null;
  /** ここで止める位置。`null` なら上限に当たるまで */
  readonly to: number | null;
}

export interface ReadConversationUseCase {
  execute(request: ConversationRequest): Promise<Result<Observation<ConversationPage>>>;
}

export function createReadConversation(deps: {
  readonly tree: TreeSnapshotService;
  readonly events: TranscriptEventsRepository;
}): ReadConversationUseCase {
  const { tree, events } = deps;

  return {
    async execute({ file, from, to }) {
      const snapshot = await tree.get();
      if (!snapshot.ok) return snapshot;

      const scope = fromTree(snapshot.value);
      /* 在るか無いかは答えない。断り方を分けると、尋ねて回るだけで
         置き場に何が在るかが分かってしまう。 */
      if (!allowsTranscript(scope, file)) {
        return err(new TranscriptOutOfScopeError('観測していない正本を開こうとした'));
      }

      const page = await events.readPage(
        file,
        {
          from,
          to,
          tailWindowBytes: TAIL_WINDOW_BYTES,
          maxChunkBytes: MAX_CHUNK_BYTES,
          maxItems: MAX_EVENTS,
          readBlockBytes: READ_BLOCK_BYTES,
        },
        /* 上限は「見せるイベント」で数える。行で数えると、道具どうしの内部の
           やりとりばかりの区間で、見せるものが 1 つも無い頁が返る。 */
        (line) => reduceEvent(line),
      );
      return ok(page);
    },
  };
}
