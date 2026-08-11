/* 覚えている 1 枚を挟んで 2 度続けて配ったとき、2 度目にも木が丸ごと届くこと。
   **層に紐づかない契約なので、`src/` を写した構造の外に置いてある。**

   この契約は `application` の service と `interface` の controller の噛み合わせで決まる。
   片方だけを見ていると、どちらも正しく見えて壊れる —— service は覚えている 1 枚を
   「配らずに返す」と決めていて、controller はそれを配り直す責任を負っている。
   そのために両方を `import` する。`src/` を写した構造の中では書けない `import` である。 */

import { describe, expect, it } from 'vitest';
import { observed } from '~/app-kernel/observation.ts';
import { ok } from '~/app-kernel/result.ts';
import { createTreeSnapshot } from '~/application/services/sessions/tree-snapshot.service.ts';
import type { ProjectTree } from '~/application/use-cases/sessions/observe-tree.use-case.ts';
import { streamTree } from '~/interface/controllers/sessions/tree.controller.ts';

const TREE: ProjectTree = {
  generatedAtMs: Date.parse('2026-08-04T00:00:00.000Z'),
  activeThresholdMs: 60_000,
  sources: observed(1),
  processes: observed(0),
  projects: [
    {
      id: 'a-project',
      slugs: ['a-project'],
      path: '/w/a-project',
      canonicalPath: '/w/a-project',
      name: 'a-project',
      liveProcessCount: 0,
      sessions: [],
      latestActivityMs: Date.parse('2026-08-04T00:00:00.000Z'),
      recentTokens: observed(0),
      walked: observed(0),
    },
  ],
};

/* 時計を手で持つ。TTL の内側と外側を、待たずに行き来するためである */
function scene() {
  let nowMs = 1000;
  const snapshot = createTreeSnapshot({
    clock: { now: () => nowMs },
    ttlMs: 1000,
    observe: {
      execute: async () => ok(TREE),
      observe: async function* () {
        // 本物と同じく、行の識別だけを持つ索引を先に配る
        yield {
          kind: 'index' as const,
          index: {
            generatedAtMs: TREE.generatedAtMs,
            activeThresholdMs: TREE.activeThresholdMs,
            sources: TREE.sources,
            processes: TREE.processes,
            stubs: [],
          },
        };
        return ok(TREE);
      },
    },
  });

  return {
    advance: (ms: number) => {
      nowMs += ms;
    },
    chunks: async () => {
      const chunks = [];
      for await (const chunk of streamTree(snapshot)) chunks.push(chunk);
      return chunks;
    },
  };
}

describe('木を順に配る契約', () => {
  it('1 度目は、まだ中身を読んでいない索引から配り始める', async () => {
    expect((await scene().chunks())[0]).toEqual({
      kind: 'tree',
      tree: expect.objectContaining({ complete: false }),
    });
  });

  it('覚えている間に来た 2 度目にも、木が丸ごと届く', async () => {
    const s = scene();
    await s.chunks();
    s.advance(100);

    expect(
      (await s.chunks())[0],
      '木を配らずに読み終えたことだけを伝えると、2 度目だけがプロジェクトの無い一覧になる',
    ).toEqual({
      kind: 'tree',
      tree: expect.objectContaining({
        complete: true,
        projects: [expect.objectContaining({ id: 'a-project' })],
      }),
    });
  });

  it('覚えている間に何度来ても、プロジェクトが消える回が無い', async () => {
    const s = scene();
    await s.chunks();
    s.advance(100);
    const second = await s.chunks();
    s.advance(100);
    const third = await s.chunks();

    const idsOf = (chunks: typeof second) =>
      chunks.flatMap((chunk) =>
        chunk.kind === 'tree' ? chunk.tree.projects.map((project) => project.id) : [],
      );

    expect(
      [idsOf(second), idsOf(third)],
      '走査と覚えている 1 枚が交互に返るあいだ、一覧が出ては消えるのを繰り返す',
    ).toEqual([['a-project'], ['a-project']]);
  });
});
