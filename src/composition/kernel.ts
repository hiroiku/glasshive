import { systemClock } from '~/app-kernel/clock.ts';
import { createConflictCache } from '~/application/services/git/conflict-cache.service.ts';
import type { ChangeBroadcastService } from '~/application/services/sessions/change-broadcast.service.ts';
import { createChangeBroadcast } from '~/application/services/sessions/change-broadcast.service.ts';
import { createTranscriptDrafts } from '~/application/services/sessions/transcript-draft.service.ts';
import { createTranscriptSearch } from '~/application/services/sessions/transcript-search.service.ts';
import {
  createTreeSnapshot,
  type TreeSnapshotService,
} from '~/application/services/sessions/tree-snapshot.service.ts';
import {
  createObserveRef,
  type ObserveRefUseCase,
} from '~/application/use-cases/git/observe-ref.use-case.ts';
import {
  createObserveRepository,
  type ObserveRepositoryUseCase,
} from '~/application/use-cases/git/observe-repository.use-case.ts';
import {
  createGetIssue,
  type GetIssueUseCase,
} from '~/application/use-cases/issues/get-issue.use-case.ts';
import {
  createListIssues,
  type ListIssuesUseCase,
} from '~/application/use-cases/issues/list-issues.use-case.ts';
import { createObserveTree } from '~/application/use-cases/sessions/observe-tree.use-case.ts';
import {
  createObserveUsage,
  type ObserveUsageUseCase,
} from '~/application/use-cases/sessions/observe-usage.use-case.ts';
import {
  createReadConversation,
  type ReadConversationUseCase,
} from '~/application/use-cases/sessions/read-conversation.use-case.ts';
import {
  createSearchTranscripts,
  type ObserveSearchUseCase,
} from '~/application/use-cases/sessions/search-transcripts.use-case.ts';
import {
  createReadPreferences,
  type ReadPreferencesUseCase,
} from '~/application/use-cases/workspace/read-preferences.use-case.ts';
import {
  createWritePreferences,
  type WritePreferencesUseCase,
} from '~/application/use-cases/workspace/write-preferences.use-case.ts';
import { currentSettings, type Settings } from '~/infrastructure/config/paths.ts';
import { createCliGitCommandIntegration } from '~/infrastructure/integrations/git/cli-git-command.integration.ts';
import { createFsWatchTranscript } from '~/infrastructure/integrations/sessions/fs-watch-transcript.integration.ts';
import { createOsAgentProcessIntegration } from '~/infrastructure/integrations/sessions/os-agent-process.integration.ts';
import { createFsIssueLedgerRepository } from '~/infrastructure/repositories/issues/fs-issue-ledger.repository.ts';
import { createFsTranscriptRepository } from '~/infrastructure/repositories/sessions/fs-transcript.repository.ts';
import { createFsTranscriptEventsRepository } from '~/infrastructure/repositories/sessions/fs-transcript-events.repository.ts';
import { createFsViewerPreferencesRepository } from '~/infrastructure/repositories/workspace/fs-viewer-preferences.repository.ts';

/* 組み立ての場所。口と実装をここでだけ繋ぐ。

   内側の層はどれも、誰が実装を差し込んだかを知らない。知っているのはここだけである。

   遅延して 1 つだけ作るのは、見張りをこの道具に 1 つに保つため(change-broadcast.service.ts)。
   窓が開くたびに作ると、OS の見張りが窓の数だけ増える。 */

export interface Kernel {
  settings: Settings;
  changes: ChangeBroadcastService;
  tree: TreeSnapshotService;
  conversation: ReadConversationUseCase;
  usage: ObserveUsageUseCase;
  search: ObserveSearchUseCase;
  listIssues: ListIssuesUseCase;
  getIssue: GetIssueUseCase;
  gitOverview: ObserveRepositoryUseCase;
  gitRef: ObserveRefUseCase;
  readPreferences: ReadPreferencesUseCase;
  writePreferences: WritePreferencesUseCase;
}

let instance: Kernel | undefined;

function assemble(): Kernel {
  const settings = currentSettings();
  /* 覚えるのは application の側である。置き場の口は素材しか知らないので、
     ここに覆いを掛けると生の字を抱え込むことになる — 正本 1 つで最大 12MiB、
     数千本ある置き場では観る前に機械が音を上げる。 */
  const transcripts = createFsTranscriptRepository({
    transcriptsRoot: settings.transcriptsRoot,
  });
  /* 読み解きの覚えは 1 つだけ持つ。木も統計も同じ素材を見るので、別に持つと
     同じ 8MiB を二度読んで二度抱えることになる。 */
  const drafts = createTranscriptDrafts({
    transcripts,
    activeThresholdMs: settings.activeThresholdMs,
  });
  const tree = createTreeSnapshot({
    observe: createObserveTree({
      transcripts,
      processes: createOsAgentProcessIntegration(),
      activeThresholdMs: settings.activeThresholdMs,
      drafts,
    }),
    clock: systemClock,
  });

  /* 台帳は巣ごとに在る。口は場所を言われて開くだけなので、置き場を持たない */
  const ledger = createFsIssueLedgerRepository();

  /* 外の道具は巣ごとに起こす。ぶつかりの見込みだけは、先端の組が同じなら覚えたものを返す —
     線が 18 本あれば差分だけで 18 回起こすことになり、そこが一番重い。 */
  const git = createCliGitCommandIntegration();

  const changes = createChangeBroadcast(createFsWatchTranscript(settings.transcriptsRoot));
  /* 正本が動いたら、覚えている盤面を捨てる。捨てないと、合図で取り直しても
     短い間だけ古い盤面が返り、変わったはずの画面が変わらない。 */
  changes.subscribe(() => tree.invalidate());

  /* この道具で唯一の書き込み。置き場だけを渡し、書いてよいかの見張りは実装が自分で持つ。 */
  const preferences = createFsViewerPreferencesRepository({
    configDir: settings.configDir,
  });

  return {
    settings,
    changes,
    tree,
    conversation: createReadConversation({
      tree,
      events: createFsTranscriptEventsRepository(),
    }),
    usage: createObserveUsage({ tree, drafts }),
    search: createSearchTranscripts({
      tree,
      search: createTranscriptSearch({ transcripts }),
    }),
    listIssues: createListIssues({ ledger }),
    getIssue: createGetIssue({ ledger }),
    gitOverview: createObserveRepository({ git, conflicts: createConflictCache() }),
    gitRef: createObserveRef({ git }),
    readPreferences: createReadPreferences({ preferences }),
    writePreferences: createWritePreferences({ preferences }),
  };
}

export function getKernel(): Kernel {
  if (instance === undefined) instance = assemble();
  return instance;
}

/** 検査のために作り直す。本番の道では呼ばない */
export function resetKernel(): void {
  instance?.changes.close();
  instance = undefined;
}
