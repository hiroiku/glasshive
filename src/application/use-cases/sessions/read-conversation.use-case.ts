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

/* 会話を 1 ページぶん読む。

   **開いてよいのは、いまの一覧が実際に観測した `transcript` だけである。** 判定は集合に
   含まれるかどうかで行う。前方一致で見ると、観測した `transcript` の隣に置かれただけの
   別のファイルが「中にある」ことになる。

   ページの広さと上限は domain の値をそのままポートへ渡す。実装は言われたとおりに開くだけで、
   どこまで読むかを自分では決めない。 */

export type {
  ConversationBlock,
  ConversationEvent,
  ConversationRole,
} from '~/domain/entities/sessions/conversation-event.entity.ts';

export type ConversationPage = TranscriptPage<ConversationEvent>;

export interface ConversationRequest {
  readonly file: string;
  /** 読み始める位置。`null` なら末尾の読み取り範囲 */
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
         `~/.claude/projects` に何が在るかが分かってしまう。 */
      if (!allowsTranscript(scope, file)) {
        return err(new TranscriptOutOfScopeError('Not an observed transcript'));
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
        /* 上限は「見せるイベント」で数える。行で数えると、ツールの呼び出しと結果ばかりが
           並ぶ区間で、見せるものが 1 つも無いページが返る。 */
        (line) => reduceEvent(line),
      );
      return ok(page);
    },
  };
}
