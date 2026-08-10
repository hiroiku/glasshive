import { describe, expect, it } from 'vitest';
import { UnexpectedError } from '~/app-kernel/error.ts';
import { observed, unobservable } from '~/app-kernel/observation.ts';
import type { AgentProcessIntegration } from '~/application/ports/integrations/sessions/agent-process.integration.ts';
import type {
  TranscriptGroup,
  TranscriptRepository,
} from '~/application/ports/repositories/sessions/transcript.repository.ts';
import { createTranscriptDrafts } from '~/application/services/sessions/transcript-draft.service.ts';
import { createTranscriptIndex } from '~/application/services/sessions/transcript-index.service.ts';
import { createObserveTree } from '~/application/use-cases/sessions/observe-tree.use-case.ts';

/* 何が並ぶかを、中身を読む前に決める 1 枚。

   ここで見るのは 2 つ。**索引は先頭と末尾しか開かない**こと(パスを引くだけの呼び出しが
   `~/.claude/projects` を全部読まなくなる、というのがこの分割の目的である)と、
   **行の識別が索引の時点で確定している**ことである。 */

const NOW = 1_700_000_000_000;
const ACTIVE_THRESHOLD_MS = 60_000;

const HEAD = `${JSON.stringify({ type: 'user', cwd: '/w/proj', timestamp: '2026-01-01T00:00:00Z' })}\n`;

function sourceOf(slug: string, name: string, subagents: readonly string[] = []): TranscriptGroup {
  return {
    slug,
    sessions: [
      {
        id: name,
        fileName: `${name}.jsonl`,
        file: `/nest/projects/${slug}/${name}.jsonl`,
        mtimeMs: NOW,
        sizeBytes: HEAD.length,
        subagents: subagents.map((child) => ({
          id: child,
          fileName: `${child}.jsonl`,
          file: `/nest/projects/${slug}/${name}/subagents/${child}.jsonl`,
          mtimeMs: NOW,
          sizeBytes: HEAD.length,
          meta: null,
          runId: null,
        })),
      },
    ],
  };
}

/** 読みに行った範囲の大きさを控える偽のポート。**どこまで開いたかそのものが確かめたいこと** */
function spyRepository(groups: readonly TranscriptGroup[]) {
  const heads: number[] = [];
  const tails: number[] = [];
  const transcripts: TranscriptRepository = {
    async listTranscripts() {
      return observed(groups);
    },
    async statTranscript() {
      return observed({ mtimeMs: NOW, sizeBytes: HEAD.length });
    },
    async readHead(_at, request) {
      heads.push(request.maxBytes);
      return observed({ text: HEAD, complete: true });
    },
    async readTail(_at, request) {
      tails.push(request.maxBytes);
      return observed({ text: '', complete: true });
    },
    async canonicalize(target) {
      return observed(target);
    },
  };
  return { transcripts, heads, tails };
}

function sceneOf(groups: readonly TranscriptGroup[], processes?: AgentProcessIntegration) {
  const spy = spyRepository(groups);
  const drafts = createTranscriptDrafts({
    transcripts: spy.transcripts,
    activeThresholdMs: ACTIVE_THRESHOLD_MS,
  });
  const index = createTranscriptIndex({
    transcripts: spy.transcripts,
    processes: processes ?? { list: async () => observed([]) },
    drafts,
    activeThresholdMs: ACTIVE_THRESHOLD_MS,
    clock: { now: () => NOW },
    ttlMs: 0,
  });
  return {
    ...spy,
    index,
    observe: createObserveTree({ index, drafts, activeThresholdMs: ACTIVE_THRESHOLD_MS }),
  };
}

const indexOf = async (scene: ReturnType<typeof sceneOf>) => {
  const snapshot = await scene.index.get();
  if (!snapshot.ok) throw snapshot.error;
  return snapshot.value;
};

describe('中身を読む前の索引', () => {
  it('`transcript` 1 本につき、先頭と末尾を 1 度ずつしか開かない', async () => {
    const scene = sceneOf([sourceOf('a', 'session')]);

    await indexOf(scene);

    expect(scene.heads, '作業ディレクトリは先頭に在る').toHaveLength(1);
    expect(scene.tails, '末尾は自分の番が終わっているかを見るためだけに開く').toHaveLength(1);
  });

  it('木より狭い範囲しか開かない', async () => {
    const scene = sceneOf([sourceOf('a', 'session')]);

    await indexOf(scene);
    const widestForIndex = Math.max(...scene.tails);

    await scene.observe.execute(NOW);
    const widestForTree = Math.max(...scene.tails);

    expect(
      widestForIndex,
      '稼働区間と消費のための読み取り範囲は、パスを引くのに要らない',
    ).toBeLessThan(widestForTree);
  });

  it('行の識別は、中身を読む前に確定している', async () => {
    const scene = sceneOf([sourceOf('a', 'session')]);

    const snapshot = await indexOf(scene);

    expect(snapshot.index.stubs).toHaveLength(1);
    expect(snapshot.index.stubs[0]?.id).toBe('a');
    expect(snapshot.index.stubs[0]?.canonicalPath).toBe('/w/proj');
    expect(snapshot.index.stubs[0]?.name).toBe('proj');
  });

  it('同じパスを指す slug は、索引の時点で 1 行に束ねてある', async () => {
    const scene = sceneOf([sourceOf('b', 'later'), sourceOf('a', 'earlier')]);

    const snapshot = await indexOf(scene);

    expect(snapshot.index.stubs, '束ねてから配らないと、行が後から併合して消える').toHaveLength(1);
    expect(snapshot.index.stubs[0]?.id, '代表は辞書順で決まる').toBe('a');
    expect(snapshot.index.stubs[0]?.slugs).toEqual(['a', 'b']);
  });

  it('`transcript` の数は、セッションと子を合わせて数える', async () => {
    const scene = sceneOf([sourceOf('a', 'session', ['agent-1', 'agent-2'])]);

    const snapshot = await indexOf(scene);

    expect(
      snapshot.index.stubs[0]?.transcriptCount,
      '読み終えた数の分母である。子を数え落とすと、分子が分母を追い越す',
    ).toBe(3);
  });

  it('走査できなかったことは、プロジェクトが無いことと分けて持つ', async () => {
    const spy = spyRepository([]);
    const transcripts: TranscriptRepository = {
      ...spy.transcripts,
      async listTranscripts() {
        return unobservable(new UnexpectedError('走査できない'));
      },
    };
    const drafts = createTranscriptDrafts({ transcripts, activeThresholdMs: ACTIVE_THRESHOLD_MS });
    const index = createTranscriptIndex({
      transcripts,
      processes: { list: async () => observed([]) },
      drafts,
      activeThresholdMs: ACTIVE_THRESHOLD_MS,
      clock: { now: () => NOW },
      ttlMs: 0,
    });

    const snapshot = await index.get();
    if (!snapshot.ok) throw snapshot.error;
    expect(snapshot.value.index.sources.kind).toBe('unobservable');
    expect(snapshot.value.index.stubs).toEqual([]);
  });
});

/* 索引のための読みが、本読みに足されないこと。 */
describe('索引と本読みの読み取り', () => {
  it('索引が開いた先頭と末尾を、木は開き直さない', async () => {
    const scene = sceneOf([sourceOf('a', 'session')]);

    await indexOf(scene);
    const headsAfterIndex = scene.heads.length;
    /* 索引が開いた末尾の幅。木がここを開き直すなら、同じ幅がもう一度並ぶ */
    const narrow = Math.max(...scene.tails);
    const narrowAfterIndex = scene.tails.filter((bytes) => bytes === narrow).length;

    const result = await scene.observe.execute(NOW);
    expect(result.ok).toBe(true);

    expect(
      scene.heads.length,
      '同じキーで覚えてあるので、索引のための読みは総量として足されない',
    ).toBe(headsAfterIndex);
    expect(
      scene.tails.filter((bytes) => bytes === narrow).length,
      '木が開き直すなら、索引を挟んだぶんだけ読む量が増えている',
    ).toBe(narrowAfterIndex);
  });

  it('木は、索引が開かなかった範囲を開く', async () => {
    const scene = sceneOf([sourceOf('a', 'session')]);

    await indexOf(scene);
    const tailsAfterIndex = scene.tails.length;
    await scene.observe.execute(NOW);

    expect(scene.tails.length, '稼働区間と消費は、木を組むときに初めて読む').toBeGreaterThan(
      tailsAfterIndex,
    );
  });
});
