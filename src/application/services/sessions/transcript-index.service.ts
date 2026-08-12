import type { Clock } from '~/app-kernel/clock.ts';
import { mapObserved, observed } from '~/app-kernel/observation.ts';
import { samePath } from '~/app-kernel/path.ts';
import { ok, type Result } from '~/app-kernel/result.ts';
import type { AgentProcessIntegration } from '~/application/ports/integrations/sessions/agent-process.integration.ts';
import type {
  SessionSource,
  TranscriptGroup,
  TranscriptRepository,
} from '~/application/ports/repositories/sessions/transcript.repository.ts';
import type { TranscriptDraftService } from '~/application/services/sessions/transcript-draft.service.ts';
import type { ProjectIndex } from '~/domain/entities/sessions/observed-project.entity.ts';
import {
  buildProjectIndex,
  deriveGroupPath,
  type LocatedGroup,
} from '~/domain/services/sessions/project-index.service.ts';
import { slugOfPath } from '~/domain/value-objects/sessions/project-slug.value-object.ts';
import { isSubagentFileName } from '~/domain/value-objects/sessions/subagent-id.value-object.ts';

/* 何が並ぶかを、中身を読む前に決める。

   ここが在るのは 2 つの理由による。

   ひとつは、**プロジェクトのパスを引くだけのために木を組むのをやめる**ため。Git も課題も
   会話も「この id はどこに在るか」しか要らないのに、これまでは木を丸ごと組んでいた。
   索引だけなら、読むのは各 `transcript` の先頭と末尾に留まる。

   もうひとつは、**行の識別を配る前に確定させる**ため。`id` も名前もプロセスの数も一覧
   全体を見ないと決まらないので、読み終えた順に配ると行が後から改名も併合もする。 */

/* 観ると決めたディレクトリ。**深く読むのはここに在るものだけである。**

   `roots` は記録そのもの、`worktrees` は同じリポジトリに居る作業ツリーである。分けてあるのは、
   `transcript` を 1 本も持たない行を作ってよいのが `roots` だけだからである —— 記録した
   ディレクトリは空でも一覧に要るが、空の worktree まで並べると、押しても何も無い行が増える。 */
export interface WatchedScope {
  readonly roots: readonly string[];
  readonly worktrees: readonly string[];
  /* 1 つ前の形から引き継いだ id。**パスを持っていない。**

     留めてあったのはプロジェクトの id で、id からパスは決まらない。id は走査で見えた名前
     そのものなので、名前として突き合わせれば読み替えなしに引き継げる。 */
  readonly slugs: readonly string[];
}

const NOTHING_WATCHED: WatchedScope = { roots: [], worktrees: [], slugs: [] };

/** 索引 1 枚と、それを作ったときの走査結果 */
export interface TranscriptIndexSnapshot {
  readonly index: ProjectIndex;
  /* 観ると決めたものの id。**索引には見つけただけのものも並ぶ** —— 一覧に出すのはここに
     在るものだけで、残りは「記録しますか」と尋ねる相手である。

     記録は絶対パスで持たれていて、id はこの走査でしか決まらない。突き合わせはここでしか
     できないので、読み替えた結果をそのまま運ぶ。 */
  readonly watchedIds: ReadonlySet<string>;
  /* 走査で見えた `transcript` すべて。**読んでよい範囲はここから作る。**

     子は `isSubagentFileName` を落ちたものを外してある。木から作る範囲と同じ集合に
     しておかないと、木では読めないファイルが索引では読める、という食い違いになる。 */
  readonly transcriptFiles: ReadonlySet<string>;
  /** 走査結果そのもの。木を組むときに、走査からやり直さずに済ませる */
  readonly groups: readonly TranscriptGroup[];
}

export interface TranscriptIndexService {
  get(): Promise<Result<TranscriptIndexSnapshot>>;
  invalidate(): void;
}

/** 覚えておく時間。木のスナップショットと同じ長さにする — 同じ 1 枚を分け合うためである */
const DEFAULT_TTL_MS = 1000;

/** 索引を組むのに要るところだけを持つ、`transcript` 1 本 */
interface LocatedTranscript {
  readonly file: string;
  readonly cwd: string | null;
  readonly lastActivityMs: number;
  readonly transcriptCount: number;
}

/** 子として数えるものだけを残す。数え方を `readSession` と揃える */
const subagentsOf = (source: SessionSource) =>
  source.subagents.filter((child) => isSubagentFileName(child.fileName));

/** いちばん新しく書かれた `transcript`。場所を知るために 1 本だけ開く相手である */
const newestOf = (sessions: readonly SessionSource[]): SessionSource | undefined =>
  sessions.reduce<SessionSource | undefined>(
    (newest, source) => (newest === undefined || source.mtimeMs > newest.mtimeMs ? source : newest),
    undefined,
  );

/* 開かずに済ませた `transcript`。**書かれた時刻の代わりに、ファイルが最後に動いた時刻を置く。**

   ここで要るのは「最近まで動いていたか」だけである。作業ディレクトリは書かれていた場所を
   読まなければ分からないので、`null` のままにする —— 名前から起こすと、当てずっぽうが
   場所として一覧に並ぶ。 */
const statOnly = (source: SessionSource): LocatedTranscript => ({
  file: source.file,
  cwd: null,
  lastActivityMs: source.mtimeMs,
  transcriptCount: 1 + subagentsOf(source).length,
});

export function createTranscriptIndex(deps: {
  readonly transcripts: TranscriptRepository;
  readonly processes: AgentProcessIntegration;
  readonly drafts: TranscriptDraftService;
  readonly activeThresholdMs: number;
  readonly clock: Clock;
  readonly ttlMs?: number;
  /* 観ると決めたディレクトリ。**深く読むのはここに在るものだけである。**

     走査そのものは今までどおり `~/.claude/projects` の全部を見る。見つけた名前を捨てないのは、
     記録していないディレクトリを「見つけたが、まだ観ていないもの」として数えられなくなるからで、
     捨てると Overview から選び直すこともできなくなる。

     記録したディレクトリは、まだ `transcript` を 1 本も持っていなくても一覧に載せる ——
     打った相手が一覧に居なければ、開くウィンドウがどこにも無い。 */
  readonly watched?: () => Promise<WatchedScope>;
}): TranscriptIndexService {
  const ttlMs = deps.ttlMs ?? DEFAULT_TTL_MS;
  let cachedAtMs = Number.NEGATIVE_INFINITY;
  let cached: TranscriptIndexSnapshot | undefined;
  let inFlight: Promise<Result<TranscriptIndexSnapshot>> | undefined;
  /* 変更通知が来た回数。走り始めたときの数と突き合わせないと、走っている最中に来た
     変更通知が走り終えた瞬間に上書きで消える。 */
  let signals = 0;

  /* 記録したディレクトリを一覧に足す。**すでに居るなら足さない** —— 同じ場所が 2 行に
     割れて、片方だけにセッションが並ぶ。居るのに `transcript` を 1 本も持たない行には、
     一覧に残す指定だけを付ける。 */
  async function includeNamed(
    groups: LocatedGroup<LocatedTranscript>[],
    roots: readonly string[],
    watchedSlugs: Set<string>,
  ): Promise<void> {
    for (const named of roots) {
      const canonical = await deps.transcripts.canonicalize(named);
      const path = canonical.kind === 'observed' ? canonical.value : named;
      const slug = slugOfPath(path);
      const at = groups.findIndex(
        (group) =>
          group.slug === slug ||
          (group.canonicalPath !== null && samePath(group.canonicalPath, path)),
      );
      const existing = at < 0 ? undefined : groups[at];
      if (existing !== undefined) {
        groups[at] = { ...existing, namedPath: path };
        watchedSlugs.add(existing.slug);
        continue;
      }
      watchedSlugs.add(slug);
      /* まだ `transcript` が 1 本も無いディレクトリ。**数え上げられなかったのではなく、
         0 本だと分かっている。** そこで Claude Code が動き出せば、同じ名前の下に増えていく。 */
      groups.push({
        slug,
        canonicalPath: path,
        sessions: [],
        walked: observed(0),
        namedPath: path,
      });
    }
  }

  async function build(nowMs: number): Promise<Result<TranscriptIndexSnapshot>> {
    const [groups, live] = await Promise.all([
      deps.transcripts.listTranscripts(),
      deps.processes.list(),
    ]);
    const found: readonly TranscriptGroup[] = groups.kind === 'observed' ? groups.value : [];
    const scope = (await deps.watched?.()) ?? NOTHING_WATCHED;
    const wanted = [...scope.roots, ...scope.worktrees];
    /* 記録したパスから決まる名前。**名前で決まるものは、1 本も開かずに決まる。** */
    const wantedSlugs = new Set([...wanted.map(slugOfPath), ...scope.slugs]);

    const transcriptFiles = new Set<string>();
    const located: LocatedGroup<LocatedTranscript>[] = [];
    const watchedSlugs = new Set<string>();

    for (const group of found) {
      /* 名前で決まらないディレクトリは、いちばん新しい 1 本だけ開いて場所を見る。

         **開かずに済ませられない。** 同じディレクトリを別の書き表し方で記録していることが
         在り(`/Volumes/…` と `/Users/…` など)、そのとき名前は一致しない。1 本も開かずに
         名前だけで決めると、記録したはずのディレクトリが一覧に出ない。 */
      const newest = newestOf(group.sessions);
      const probe = newest === undefined ? undefined : await deps.drafts.readLocation(newest);
      const canonical = await canonicalPathOf(
        wantedSlugs.has(group.slug) ? null : (probe?.cwd ?? null),
      );
      const watched =
        wantedSlugs.has(group.slug) ||
        (canonical !== null && wanted.some((path) => samePath(path, canonical)));

      /* 記録していないディレクトリは、ここで止める。**読むのは名前と stat と、場所を知る
         ための 1 本だけ。** 全部を開くと、観る相手を選んだ意味が無くなる。 */
      const sessions = watched
        ? await locateAll(group, transcriptFiles)
        : group.sessions.map((source) =>
            source === newest && probe !== undefined ? probe : statOnly(source),
          );

      if (watched) watchedSlugs.add(group.slug);
      /* パスの書き表し方の揺れは、ここで正規化しておく。正規化せずに渡すと、同じ実体の
         プロジェクトが別名のまま二つに並び、プロセスの帰属も割れる。

         **正規化できなかったことは null のまま渡す。** 渡された文字列で代えるのは束ねる
         側の決め事で、ここでも代えると同じ判断が二か所に散る。 */
      located.push({
        slug: group.slug,
        canonicalPath: watched ? await canonicalPathOf(deriveGroupPath(sessions)) : canonical,
        sessions,
        /* 走査できたかどうかを、そのまま渡す。ここで潰すと、読めなかったディレクトリが
           「セッションを 1 つも持たない slug」として一覧から落ちる。 */
        walked: group.walked,
      });
    }

    await includeNamed(located, scope.roots, watchedSlugs);

    const index = buildProjectIndex({
      groups: located,
      processes: live,
      sources: mapObserved(groups, (dirs) => dirs.length),
      nowMs,
      activeThresholdMs: deps.activeThresholdMs,
      transcriptsOf: (session) => session.transcriptCount,
    });

    return ok({
      index,
      /* 束ねた後の id で答える。**束ねる前の名前で持ち回ると、同じ場所を指す 2 つの名前の
         片方だけが記録されているときに、行と記録が食い違う。** */
      watchedIds: new Set(
        index.stubs
          .filter((stub) => stub.slugs.some((slug) => watchedSlugs.has(slug)))
          .map((stub) => stub.id),
      ),
      transcriptFiles,
      groups: found,
    });
  }

  /** 深く読む。読んだ `transcript` は、そのまま読んでよい範囲になる */
  async function locateAll(
    group: TranscriptGroup,
    transcriptFiles: Set<string>,
  ): Promise<LocatedTranscript[]> {
    const sessions: LocatedTranscript[] = [];
    for (const source of group.sessions) {
      transcriptFiles.add(source.file);
      for (const child of subagentsOf(source)) transcriptFiles.add(child.file);
      sessions.push(await deps.drafts.readLocation(source));
    }
    return sessions;
  }

  const canonicalPathOf = async (path: string | null): Promise<string | null> => {
    if (path === null) return null;
    const canonical = await deps.transcripts.canonicalize(path);
    return canonical.kind === 'observed' ? canonical.value : null;
  };

  return {
    async get() {
      const nowMs = deps.clock.now();
      if (cached !== undefined && nowMs - cachedAtMs < ttlMs) return ok(cached);
      if (inFlight !== undefined) return inFlight;

      const startedAt = signals;
      const running = build(nowMs);
      inFlight = running;
      try {
        const result = await running;
        // 走っている間に変更通知が来ていたら、この結果は通知より前の索引である
        if (result.ok && signals === startedAt) {
          cached = result.value;
          cachedAtMs = nowMs;
        }
        return result;
      } finally {
        inFlight = undefined;
      }
    },
    invalidate() {
      signals += 1;
      cached = undefined;
      cachedAtMs = Number.NEGATIVE_INFINITY;
    },
  };
}
