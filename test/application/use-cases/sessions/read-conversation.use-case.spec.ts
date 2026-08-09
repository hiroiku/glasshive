import { describe, expect, it } from 'vitest';
import { type Observation, observed } from '~/app-kernel/observation.ts';
import { ok } from '~/app-kernel/result.ts';
import type {
  TranscriptEventsRepository,
  TranscriptPage,
} from '~/application/ports/repositories/sessions/transcript-events.repository.ts';
import type { TreeSnapshotService } from '~/application/services/sessions/tree-snapshot.service.ts';
import type { ProjectTree } from '~/application/use-cases/sessions/observe-tree.use-case.ts';
import { createReadConversation } from '~/application/use-cases/sessions/read-conversation.use-case.ts';

/* 会話を読む求めを、受けてよいかどうか。

   **ここが緩むと、この道具は手元のファイルを何でも配る窓になる。** 旧実装は
   任意の絶対パスを受けており、画像を 1 枚読み込ませるだけで正本の全文が外へ流れた。 */

const OBSERVED_FILE = '/nest/projects/a/session.jsonl';
const OBSERVED_SUB = '/nest/projects/a/session/subagents/sub.jsonl';

function treeWith(files: readonly string[]): ProjectTree {
  const [first, ...rest] = files;
  return {
    generatedAtMs: 0,
    activeThresholdMs: 60_000,
    sources: observed(1),
    processes: observed(0),
    projects: [
      {
        id: 'a',
        slugs: ['a'],
        path: '/nest/a',
        canonicalPath: '/nest/a',
        name: 'a',
        liveProcessCount: 0,
        latestActivityMs: 0,
        recentTokens: observed(0),
        sessions:
          first === undefined
            ? []
            : [
                {
                  id: 'session',
                  file: first,
                  state: 'ended',
                  awaiting: null,
                  title: null,
                  startedRaw: null,
                  lastActivityMs: 0,
                  ownMtimeMs: 0,
                  tokens: observed(0),
                  model: null,
                  effort: null,
                  gitBranch: null,
                  cwd: null,
                  actor: null,
                  issues: [],
                  current: null,
                  activity: observed({ intervals: [], complete: true }),
                  sizeBytes: 0,
                  subagents: rest.map((file, index) => ({
                    id: `sub-${index}`,
                    label: `sub-${index}`,
                    file,
                    state: 'ended' as const,
                    startedRaw: null,
                    lastActivityMs: 0,
                    tokens: observed(0),
                    model: null,
                    effort: null,
                    gitBranch: null,
                    cwd: null,
                    issue: null,
                    current: null,
                    activity: observed({ intervals: [], complete: true }),
                  })),
                },
              ],
      },
    ],
  };
}

const snapshotOf = (tree: ProjectTree): TreeSnapshotService => ({
  get: async () => ok(tree),
  invalidate: () => undefined,
});

/** 開かれた在り処を控える偽の口。**開いたかどうかそのものが確かめたいこと** */
function spyEvents(): TranscriptEventsRepository & { readonly opened: string[] } {
  const opened: string[] = [];
  return {
    opened,
    async readPage<T>(file: string): Promise<Observation<TranscriptPage<T>>> {
      opened.push(file);
      const page: TranscriptPage<T> = { start: 0, next: 0, eof: true, size: 0, items: [] };
      return observed(page);
    },
  };
}

describe('会話を 1 頁ぶん読む', () => {
  it('観測した正本なら開く', async () => {
    const events = spyEvents();
    const useCase = createReadConversation({
      tree: snapshotOf(treeWith([OBSERVED_FILE])),
      events,
    });

    const page = await useCase.execute({ file: OBSERVED_FILE, from: null, to: null });

    expect(page.ok).toBe(true);
    expect(events.opened).toEqual([OBSERVED_FILE]);
  });

  it('子の正本も開く', async () => {
    const events = spyEvents();
    const useCase = createReadConversation({
      tree: snapshotOf(treeWith([OBSERVED_FILE, OBSERVED_SUB])),
      events,
    });

    const page = await useCase.execute({ file: OBSERVED_SUB, from: null, to: null });

    expect(page.ok).toBe(true);
    expect(events.opened).toEqual([OBSERVED_SUB]);
  });

  it('観測していない在り処は断る', async () => {
    const events = spyEvents();
    const useCase = createReadConversation({
      tree: snapshotOf(treeWith([OBSERVED_FILE])),
      events,
    });

    const page = await useCase.execute({ file: '/etc/passwd', from: null, to: null });

    expect(page.ok).toBe(false);
    if (page.ok) return;
    expect(page.error.code).toBe('transcript.out_of_scope');
    expect(events.opened, '断る求めで正本を開いてはいけない').toEqual([]);
  });

  /* 前方一致で見ていると、観測した正本の隣に置かれただけの別のファイルが
     「中にある」ことになる。集合帰属なら、観測できた正本そのものしか通らない。 */
  it('観測した正本の隣に置いただけのものは通さない', async () => {
    const events = spyEvents();
    const useCase = createReadConversation({
      tree: snapshotOf(treeWith([OBSERVED_FILE])),
      events,
    });

    const page = await useCase.execute({
      file: '/nest/projects/a/secrets.jsonl',
      from: null,
      to: null,
    });

    expect(page.ok).toBe(false);
    expect(events.opened).toEqual([]);
  });

  /* 畳めば字が変わるものは、畳まずに断る。畳んで見比べると、観測した正本の字を借りて
     別の中身を読ませる道ができる(繋ぎを辿る OS が開くのは別の場所である)。 */
  it('遡る字を含む在り処は、畳まずに断る', async () => {
    const events = spyEvents();
    const useCase = createReadConversation({
      tree: snapshotOf(treeWith([OBSERVED_FILE])),
      events,
    });

    const page = await useCase.execute({
      file: '/nest/projects/a/../a/session.jsonl',
      from: null,
      to: null,
    });

    expect(page.ok).toBe(false);
    expect(events.opened).toEqual([]);
  });
});
