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

/** 索引 1 枚と、それを作ったときの走査結果 */
export interface TranscriptIndexSnapshot {
  readonly index: ProjectIndex;
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

export function createTranscriptIndex(deps: {
  readonly transcripts: TranscriptRepository;
  readonly processes: AgentProcessIntegration;
  readonly drafts: TranscriptDraftService;
  readonly activeThresholdMs: number;
  readonly clock: Clock;
  readonly ttlMs?: number;
  /* 名指されたディレクトリ。**まだ `transcript` を 1 本も持っていなくても一覧に載せる**
     —— 打った相手が一覧に居なければ、開くウィンドウがどこにも無い。

     観測してよい範囲ではない。走査するのは今までどおり `~/.claude/projects` の全部で、
     ここが足すのは名指されたぶんの行だけである。 */
  readonly namedPaths?: () => Promise<readonly string[]>;
}): TranscriptIndexService {
  const ttlMs = deps.ttlMs ?? DEFAULT_TTL_MS;
  let cachedAtMs = Number.NEGATIVE_INFINITY;
  let cached: TranscriptIndexSnapshot | undefined;
  let inFlight: Promise<Result<TranscriptIndexSnapshot>> | undefined;
  /* 変更通知が来た回数。走り始めたときの数と突き合わせないと、走っている最中に来た
     変更通知が走り終えた瞬間に上書きで消える。 */
  let signals = 0;

  /* 名指されたディレクトリを一覧に足す。**すでに居るなら足さない** —— 同じ場所が 2 行に
     割れて、片方だけにセッションが並ぶ。居るのに `transcript` を 1 本も持たない行には、
     一覧に残す指定だけを付ける。 */
  async function includeNamed(groups: LocatedGroup<LocatedTranscript>[]): Promise<void> {
    for (const named of (await deps.namedPaths?.()) ?? []) {
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
        continue;
      }
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

    const transcriptFiles = new Set<string>();
    const located: LocatedGroup<LocatedTranscript>[] = [];

    for (const group of found) {
      const sessions = [];
      for (const source of group.sessions) {
        transcriptFiles.add(source.file);
        for (const child of subagentsOf(source)) transcriptFiles.add(child.file);
        sessions.push(await deps.drafts.readLocation(source));
      }
      /* パスの書き表し方の揺れは、ここで正規化しておく。正規化せずに渡すと、同じ実体の
         プロジェクトが別名のまま二つに並び、プロセスの帰属も割れる。

         **正規化できなかったことは null のまま渡す。** 渡された文字列で代えるのは束ねる
         側の決め事で、ここでも代えると同じ判断が二か所に散る。 */
      const path = deriveGroupPath(sessions);
      const canonical = path === null ? null : await deps.transcripts.canonicalize(path);
      located.push({
        slug: group.slug,
        canonicalPath: canonical !== null && canonical.kind === 'observed' ? canonical.value : null,
        sessions,
        /* 走査できたかどうかを、そのまま渡す。ここで潰すと、読めなかったディレクトリが
           「セッションを 1 つも持たない slug」として一覧から落ちる。 */
        walked: group.walked,
      });
    }

    await includeNamed(located);

    return ok({
      index: buildProjectIndex({
        groups: located,
        processes: live,
        sources: mapObserved(groups, (dirs) => dirs.length),
        nowMs,
        activeThresholdMs: deps.activeThresholdMs,
        transcriptsOf: (session) => session.transcriptCount,
      }),
      transcriptFiles,
      groups: found,
    });
  }

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
