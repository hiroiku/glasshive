import { systemClock } from '~/app-kernel/clock.ts';
import { createConflictCache } from '~/application/services/git/conflict-cache.service.ts';
import {
  type AvatarCacheService,
  createAvatarCache,
} from '~/application/services/issues/avatar-cache.service.ts';
import type { ChangeBroadcastService } from '~/application/services/sessions/change-broadcast.service.ts';
import { createChangeBroadcast } from '~/application/services/sessions/change-broadcast.service.ts';
import { createTranscriptDrafts } from '~/application/services/sessions/transcript-draft.service.ts';
import {
  createTranscriptIndex,
  type TranscriptIndexService,
} from '~/application/services/sessions/transcript-index.service.ts';
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
  createGetGithubIssueBody,
  type GetGithubIssueBodyUseCase,
} from '~/application/use-cases/issues/get-github-issue-body.use-case.ts';
import {
  createGetIssue,
  type GetIssueUseCase,
} from '~/application/use-cases/issues/get-issue.use-case.ts';
import {
  createListGithubIssues,
  type ListGithubIssuesUseCase,
} from '~/application/use-cases/issues/list-github-issues.use-case.ts';
import {
  createListIssues,
  type ListIssuesUseCase,
} from '~/application/use-cases/issues/list-issues.use-case.ts';
import {
  createObserveMessages,
  type ObserveMessagesUseCase,
} from '~/application/use-cases/sessions/observe-messages.use-case.ts';
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
import { createGhIssueTrackerIntegration } from '~/infrastructure/integrations/issues/gh-issue-tracker.integration.ts';
import { createHttpAvatarIntegration } from '~/infrastructure/integrations/issues/http-avatar.integration.ts';
import { createFsWatchTranscript } from '~/infrastructure/integrations/sessions/fs-watch-transcript.integration.ts';
import { createOsAgentProcessIntegration } from '~/infrastructure/integrations/sessions/os-agent-process.integration.ts';
import { createFsIssueLedgerRepository } from '~/infrastructure/repositories/issues/fs-issue-ledger.repository.ts';
import { createFsTranscriptRepository } from '~/infrastructure/repositories/sessions/fs-transcript.repository.ts';
import { createFsTranscriptEventsRepository } from '~/infrastructure/repositories/sessions/fs-transcript-events.repository.ts';
import { createFsViewerPreferencesRepository } from '~/infrastructure/repositories/workspace/fs-viewer-preferences.repository.ts';

/* 組み立ての場所。ポートと実装をここでだけ繋ぐ。

   内側の層はどれも、誰が実装を差し込んだかを知らない。知っているのはここだけである。

   遅延して 1 つだけ作るのは、ウォッチャーを glasshive 全体で 1 つに保つためである
   (`change-broadcast.service.ts`)。接続のたびに作ると、OS のファイル監視が接続数だけ増える。 */

export interface Kernel {
  settings: Settings;
  changes: ChangeBroadcastService;
  /* 何が並ぶかだけを持つ 1 枚。**パスを引くだけの呼び出しはこちらを使う。**
     木を組ませると、`git` を 1 本走らせるために `~/.claude/projects` を全部読むことになる。 */
  index: TranscriptIndexService;
  tree: TreeSnapshotService;
  conversation: ReadConversationUseCase;
  usage: ObserveUsageUseCase;
  messages: ObserveMessagesUseCase;
  search: ObserveSearchUseCase;
  listIssues: ListIssuesUseCase;
  getIssue: GetIssueUseCase;
  listGithubIssues: ListGithubIssuesUseCase;
  /** GitHub の課題 1 件の本文。一覧は本文を運ばないので、開いた 1 件だけをここで尋ねる */
  githubIssueBody: GetGithubIssueBodyUseCase;
  /** 顔を、こちらで読んで、こちらから返す。画面は GitHub に触らない */
  avatars: AvatarCacheService;
  gitOverview: ObserveRepositoryUseCase;
  gitRef: ObserveRefUseCase;
  readPreferences: ReadPreferencesUseCase;
  writePreferences: WritePreferencesUseCase;
}

let instance: Kernel | undefined;

function assemble(): Kernel {
  const settings = currentSettings();
  /* キャッシュを持つのは application の側である。リポジトリのポートは素材しか返さないので、
     ここでキャッシュを被せると生のテキストを抱え込むことになる — `transcript` 1 本で
     最大 12MiB、数千本ある `~/.claude/projects` では画面を出す前に機械が音を上げる。 */
  const transcripts = createFsTranscriptRepository({
    transcriptsRoot: settings.transcriptsRoot,
  });
  /* パース結果のキャッシュは 1 つだけ持つ。木も統計も同じ素材を見るので、別々に持つと
     同じ 8MiB を二度読んで二度抱えることになる。 */
  const drafts = createTranscriptDrafts({
    transcripts,
    activeThresholdMs: settings.activeThresholdMs,
  });
  /* 何が並ぶかを、中身を読む前に決める 1 枚。**パスを引くだけの呼び出しはここで足りる。**
     Git も課題も会話も「この id はどこに在るか」しか要らないので、木を組ませない。 */
  const index = createTranscriptIndex({
    transcripts,
    processes: createOsAgentProcessIntegration(),
    drafts,
    activeThresholdMs: settings.activeThresholdMs,
    clock: systemClock,
  });
  const observeTree = createObserveTree({
    index,
    drafts,
    activeThresholdMs: settings.activeThresholdMs,
  });
  const tree = createTreeSnapshot({ observe: observeTree, clock: systemClock });

  /* 台帳はプロジェクトごとにある。ポートはパスを言われて開くだけなので、ルートを持たない */
  const ledger = createFsIssueLedgerRepository();

  /* `git` はプロジェクトごとに起動する。衝突の見込みだけは、先端の組が同じならキャッシュを
     返す — 先端が 18 本あれば差分を取るだけで 18 回起動することになり、そこが一番重い。 */
  const git = createCliGitCommandIntegration();

  /* GitHub へは `gh` に尋ねる。トークンを持つのは `gh` の側で、glasshive はそれを読まない。 */
  const tracker = createGhIssueTrackerIntegration();
  const avatars = createAvatarCache({ avatars: createHttpAvatarIntegration(), clock: systemClock });

  const changes = createChangeBroadcast(createFsWatchTranscript(settings.transcriptsRoot));
  /* `transcript` が動いたら、キャッシュしているスナップショットを捨てる。捨てないと、変更通知を
     受けて取り直しても短い間だけ古いスナップショットが返り、変わったはずの画面が変わらない。 */
  changes.subscribe(() => {
    index.invalidate();
    tree.invalidate();
  });

  /* glasshive で唯一の書き込み。保存先だけを渡し、書いてよいかのガードは実装が自分で持つ。 */
  const preferences = createFsViewerPreferencesRepository({
    configDir: settings.configDir,
  });

  return {
    settings,
    changes,
    index,
    tree,
    conversation: createReadConversation({
      index,
      events: createFsTranscriptEventsRepository(),
    }),
    usage: createObserveUsage({ tree, drafts }),
    messages: createObserveMessages({ tree, transcripts }),
    search: createSearchTranscripts({
      tree,
      search: createTranscriptSearch({ transcripts }),
    }),
    listIssues: createListIssues({ ledger }),
    getIssue: createGetIssue({ ledger }),
    listGithubIssues: createListGithubIssues({ git, tracker, avatars }),
    githubIssueBody: createGetGithubIssueBody({ git, tracker }),
    avatars,
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

/** テストのために作り直す。本番のコードからは呼ばない */
export function resetKernel(): void {
  instance?.changes.close();
  instance = undefined;
}
