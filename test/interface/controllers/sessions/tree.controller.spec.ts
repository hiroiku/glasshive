import { describe, expect, it } from 'vitest';
import { AppError } from '~/app-kernel/error.ts';
import { observed } from '~/app-kernel/observation.ts';
import { err, ok } from '~/app-kernel/result.ts';
import { readTree, streamTree } from '~/interface/controllers/sessions/tree.controller.ts';

/* コントローラーが持つのは、受理と不受理の分かれ目だけである。
   テストで共有する形は、コントローラー自身から引く。 */

type Snapshot = Parameters<typeof readTree>[0];
type Answer = Awaited<ReturnType<Snapshot['get']>>;
type Tree = Extract<Answer, { ok: true }>['value'];

class RefusedError extends AppError {
  readonly code = 'test.refused';
}

const TREE: Tree = {
  generatedAtMs: Date.parse('2026-08-04T00:00:00.000Z'),
  activeThresholdMs: 60_000,
  sources: observed(0),
  processes: observed(0),
  projects: [],
};

const REMEMBERED: Tree = {
  ...TREE,
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
    },
  ],
};

const snapshotOf = (answer: Answer): Snapshot => ({
  get: async () => answer,
  /* この controller が見るのは `get` だけである。`stream` は形を満たすためだけに置く */
  /* この controller が見るのは `get` だけである。`stream` は形を満たすためだけに置く。
     本物も索引を先に配るので、偽物もその順を守っておく。 */
  stream: async function* () {
    if (answer.ok) {
      yield {
        kind: 'index' as const,
        index: {
          generatedAtMs: answer.value.generatedAtMs,
          activeThresholdMs: answer.value.activeThresholdMs,
          sources: answer.value.sources,
          processes: answer.value.processes,
          stubs: [],
        },
      };
    }
    return answer;
  },
  invalidate: () => {},
});

/* 覚えている 1 枚が在るときの `stream`。**索引を配らずに、いきなり返って終わる。**
   本物の `TreeSnapshotService` が TTL の内側で返す形そのものである。 */
const rememberedOf = (answer: Answer): Snapshot => ({
  get: async () => answer,
  // biome-ignore lint/correctness/useYield: 1 つも配らずに返るところが、この偽物の要点である
  stream: async function* () {
    return answer;
  },
  invalidate: () => {},
});

const chunksOf = async (snapshot: Snapshot) => {
  const chunks = [];
  for await (const chunk of streamTree(snapshot)) chunks.push(chunk);
  return chunks;
};

describe('木を返すコントローラー', () => {
  it('受理されたリクエストは、外部 API の形に写して返す', async () => {
    expect(await readTree(snapshotOf(ok(TREE)))).toEqual(
      expect.objectContaining({
        generated_at: '2026-08-04T00:00:00Z',
        projects: [],
      }),
    );
  });

  it('断りは、値のまま外へ流さない', async () => {
    const refused = new RefusedError('受けられないリクエストだった');

    await expect(
      readTree(snapshotOf(err(refused))),
      '値のまま流すと、HTTP ステータスに写すプレゼンターを通らずに 200 で出てしまう',
    ).rejects.toBe(refused);
  });
});

describe('木を順に配るコントローラー', () => {
  it('索引を配ってから読み終える', async () => {
    expect(await chunksOf(snapshotOf(ok(TREE)))).toEqual([
      { kind: 'tree', tree: expect.objectContaining({ complete: false }) },
      { kind: 'complete' },
    ]);
  });

  it('覚えている 1 枚がそのまま返ってきたときも、木を丸ごと配る', async () => {
    expect(
      await chunksOf(rememberedOf(ok(REMEMBERED))),
      '`complete` だけを配ると、受け取る側は初期値のまま読み終えたことになり、一覧が空になる',
    ).toEqual([
      {
        kind: 'tree',
        tree: expect.objectContaining({
          complete: true,
          projects: [expect.objectContaining({ id: 'a-project' })],
        }),
      },
      { kind: 'complete' },
    ]);
  });

  it('覚えている 1 枚が断りだったときは、チャンクを 1 つも配らずに投げる', async () => {
    const refused = new RefusedError('受けられないリクエストだった');

    await expect(chunksOf(rememberedOf(err(refused)))).rejects.toBe(refused);
  });
});
