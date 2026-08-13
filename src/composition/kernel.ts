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
  type WatchedScope,
} from '~/application/services/sessions/transcript-index.service.ts';
import { createTranscriptSearch } from '~/application/services/sessions/transcript-search.service.ts';
import {
  createTreeSnapshot,
  type TreeSnapshotService,
} from '~/application/services/sessions/tree-snapshot.service.ts';
import { createNamedDirectories } from '~/application/services/workspace/named-directory.service.ts';
import {
  pinnedIdsOf,
  watchedOf,
} from '~/application/services/workspace/preferences-document.service.ts';
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
  createGetGithubIssueDiscussion,
  type GetGithubIssueDiscussionUseCase,
} from '~/application/use-cases/issues/get-github-issue-discussion.use-case.ts';
import {
  createListGithubIssueEvents,
  type ListGithubIssueEventsUseCase,
} from '~/application/use-cases/issues/list-github-issue-events.use-case.ts';
import {
  createListGithubIssues,
  type ListGithubIssuesUseCase,
} from '~/application/use-cases/issues/list-github-issues.use-case.ts';
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
  createObserveTarget,
  type ObserveTargetUseCase,
} from '~/application/use-cases/workspace/observe-target.use-case.ts';
import {
  createReadPreferences,
  type ReadPreferencesUseCase,
} from '~/application/use-cases/workspace/read-preferences.use-case.ts';
import { createWatchDirectory } from '~/application/use-cases/workspace/watch-directory.use-case.ts';
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
  /* 覚えている観測を捨てる。**捨てる先は 2 つで、必ず両方である** —— 索引だけ捨てても、
     木の側が短い間だけ古い 1 枚を返し続け、変わったはずの画面が変わらない。 */
  refresh: () => void;
  conversation: ReadConversationUseCase;
  usage: ObserveUsageUseCase;
  messages: ObserveMessagesUseCase;
  search: ObserveSearchUseCase;
  listGithubIssues: ListGithubIssuesUseCase;
  /** GitHub の課題 1 件の本文。一覧は本文を運ばないので、開いた 1 件だけをここで尋ねる */
  githubIssueBody: GetGithubIssueBodyUseCase;
  /** 開いた 1 件のやり取り。本文とは別の呼び出しで、ページを辿るぶんだけ時間が違う */
  githubIssueDiscussion: GetGithubIssueDiscussionUseCase;
  githubIssueEvents: ListGithubIssueEventsUseCase;
  /** 顔を、こちらで読んで、こちらから返す。画面は GitHub に触らない */
  avatars: AvatarCacheService;
  gitOverview: ObserveRepositoryUseCase;
  gitRef: ObserveRefUseCase;
  readPreferences: ReadPreferencesUseCase;
  writePreferences: WritePreferencesUseCase;
  /* 起動のときに名指されたディレクトリが指すプロジェクト。名指されていなければ `null` を
     答える —— そのときに開くのは Overview である。 */
  target: ObserveTargetUseCase;
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
  /* `git` はプロジェクトごとに起動する。衝突の見込みだけは、先端の組が同じならキャッシュを
     返す — 先端が 18 本あれば差分を取るだけで 18 回起動することになり、そこが一番重い。 */
  const git = createCliGitCommandIntegration();

  /* 名指されたディレクトリを覚えて、リポジトリ 1 つに読み替える。起動のときのパスと、
     あとから伝えられたパスの両方がここに集まる —— サーバーは 1 つに保つので、2 枚目
     以降の `glasshive .` は自分で立ち上がらずにここへ伝えに来る。 */
  const named = createNamedDirectories({ target: settings.target, git });

  /* glasshive で唯一の書き込み。保存先だけを渡し、書いてよいかのガードは実装が自分で持つ。 */
  const preferences = createFsViewerPreferencesRepository({
    configDir: settings.configDir,
  });

  /* 観ると決めたディレクトリを、走査の側の言葉にする。

     **記録が持っているのはパスだけである。** 同じリポジトリの worktree は別のプロジェクトに
     なるので、ここで `git` に尋ねて足す —— 記録した根だけを深く読むと、その隣で動いている
     worktree が一覧から消える。

     1 つ前の形から引き継ぐぶんは id のまま渡す。id からパスは決まらないが、id は走査で見えた
     名前そのものなので、名前として突き合わせれば読み替えずに引き継げる。 */
  async function watchedScope(): Promise<WatchedScope> {
    const document = await preferences.load();
    const stored = watchedOf(document);
    const roots = stored.kind === 'observed' ? stored.value.paths : [];
    const directories = await Promise.all(roots.map((root) => named.name(root)));
    return {
      roots,
      worktrees: directories.flatMap((directory) =>
        directory === null ? [] : [directory.rootPath, ...directory.worktrees],
      ),
      slugs: pinnedIdsOf(document),
    };
  }

  /* 何が並ぶかを、中身を読む前に決める 1 枚。**パスを引くだけの呼び出しはここで足りる。**
     Git も課題も会話も「この id はどこに在るか」しか要らないので、木を組ませない。 */
  const index = createTranscriptIndex({
    transcripts,
    processes: createOsAgentProcessIntegration(),
    drafts,
    activeThresholdMs: settings.activeThresholdMs,
    clock: systemClock,
    watched: watchedScope,
  });
  const observeTree = createObserveTree({
    index,
    drafts,
    activeThresholdMs: settings.activeThresholdMs,
    /* 名指されたリポジトリから先に読む。読むのは今までどおり全部で、変わるのは
       名指した相手が画面に揃うまでの待ち時間だけである。 */
    readFirst: async () =>
      (await named.all()).flatMap((directory) => [directory.rootPath, ...directory.worktrees]),
  });
  const tree = createTreeSnapshot({ observe: observeTree, clock: systemClock });

  /* GitHub へは `gh` に尋ねる。トークンを持つのは `gh` の側で、glasshive はそれを読まない。 */
  const tracker = createGhIssueTrackerIntegration();
  const avatars = createAvatarCache({ avatars: createHttpAvatarIntegration(), clock: systemClock });

  const refresh = () => {
    index.invalidate();
    tree.invalidate();
  };

  const changes = createChangeBroadcast(createFsWatchTranscript(settings.transcriptsRoot));
  /* `transcript` が動いたら、キャッシュしているスナップショットを捨てる。捨てないと、変更通知を
     受けて取り直しても短い間だけ古いスナップショットが返り、変わったはずの画面が変わらない。 */
  changes.subscribe(refresh);

  return {
    settings,
    changes,
    index,
    tree,
    refresh,
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
    listGithubIssues: createListGithubIssues({ git, tracker, avatars }),
    githubIssueBody: createGetGithubIssueBody({ git, tracker }),
    githubIssueDiscussion: createGetGithubIssueDiscussion({ git, tracker, avatars }),
    githubIssueEvents: createListGithubIssueEvents({ git, tracker }),
    avatars,
    gitOverview: createObserveRepository({ git, conflicts: createConflictCache() }),
    gitRef: createObserveRef({ git }),
    readPreferences: createReadPreferences({ preferences }),
    writePreferences: createWritePreferences({ preferences }),
    target: createObserveTarget({ named, index, watch: createWatchDirectory({ preferences }) }),
  };
}

/* 組み立てるのは 1 度だけである。作り直す関数は置かない —— テストは自分で依存を組んで
   ポートを差し込むのでここを通らず、ウォッチャーはプロセスが終わるときに一緒に外れる。 */
export function getKernel(): Kernel {
  if (instance === undefined) instance = assemble();
  return instance;
}
