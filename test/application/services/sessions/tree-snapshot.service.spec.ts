import { describe, expect, it } from 'vitest';
import { AppError } from '~/app-kernel/error.ts';
import { observed } from '~/app-kernel/observation.ts';
import { err, ok, type Result } from '~/app-kernel/result.ts';
import { createTreeSnapshot } from '~/application/services/sessions/tree-snapshot.service.ts';
import type { ProjectTree } from '~/application/use-cases/sessions/observe-tree.use-case.ts';

class RefusedError extends AppError {
  readonly code = 'test.refused';
}

function tree(atMs: number): ProjectTree {
  return {
    generatedAtMs: atMs,
    activeThresholdMs: 60_000,
    sources: observed(0),
    processes: observed(0),
    projects: [],
  };
}

/* 時刻と走査の終わりを手で持つフィクスチャ。時計を外から渡せるので、待たずに時間を動かせる。

   `hold()` を呼んでおくと走査が終わらないので、重なった呼び出しの振る舞いを見られる。 */
function scene() {
  let nowMs = 1000;
  let walks = 0;
  let holding = false;
  const pending: (() => void)[] = [];

  const snapshot = createTreeSnapshot({
    clock: { now: () => nowMs },
    ttlMs: 100,
    observe: {
      execute: (at) => {
        walks++;
        if (!holding) return Promise.resolve(ok(tree(at)));
        return new Promise<Result<ProjectTree>>((resolve) => {
          pending.push(() => resolve(ok(tree(at))));
        });
      },
      observe: streamOf(tree),
    },
  });

  return {
    snapshot,
    advance: (ms: number) => {
      nowMs += ms;
    },
    get walks() {
      return walks;
    },
    hold: () => {
      holding = true;
    },
    release: () => {
      holding = false;
      for (const finish of pending.splice(0)) finish();
    },
  };
}

/* この service が見るのは `execute` だけである。`observe` は形を満たすためだけに置く。
   置かずに済ませられないのは、逐次で配る経路と 1 枚で返す経路が同じ use-case に
   同居しているからで、それは「導出を 2 本持たない」ための同居である。 */
const streamOf = (build: (at: number) => ProjectTree) =>
  async function* (nowMs: number) {
    const built = build(nowMs);
    /* 索引を先に配るのは本物と同じである。この木はプロジェクトを持たないので、
       行の無い索引を配るのが正確な写しになる。 */
    yield {
      kind: 'index' as const,
      index: {
        generatedAtMs: built.generatedAtMs,
        activeThresholdMs: built.activeThresholdMs,
        sources: built.sources,
        processes: built.processes,
        stubs: [],
      },
    };
    return ok(built);
  };

describe('ひと目ぶんの観測を分け合う', () => {
  it('短い間は走査し直さない', async () => {
    const s = scene();
    await s.snapshot.get();
    await s.snapshot.get();
    expect(s.walks, '木・統計・検索が同じスナップショットを見る').toBe(1);
  });

  it('`ttlMs` を過ぎたら走査し直す', async () => {
    const s = scene();
    await s.snapshot.get();
    s.advance(100);
    await s.snapshot.get();
    expect(s.walks).toBe(2);
  });

  it('変更通知が来たら、時間が残っていても捨てる', async () => {
    const s = scene();
    await s.snapshot.get();
    s.snapshot.invalidate();
    await s.snapshot.get();
    expect(s.walks).toBe(2);
  });

  it('走っている最中に変更通知が来たら、その走査の結果は覚えない', async () => {
    const s = scene();
    s.hold();
    const first = s.snapshot.get();
    s.snapshot.invalidate();
    s.release();
    await first;

    await s.snapshot.get();
    expect(
      s.walks,
      '変更通知より前に採ったスナップショットを覚えると、変わったと知らされた後も古いスナップショットを返し続ける',
    ).toBe(2);
  });

  it('断りは覚えない', async () => {
    let calls = 0;
    const refused = new RefusedError('受け付けられない呼び出しだった');
    const snapshot = createTreeSnapshot({
      clock: { now: () => 1000 },
      ttlMs: 100,
      observe: {
        execute: async (at) => {
          calls++;
          return calls === 1 ? err(refused) : ok(tree(at));
        },
        observe: streamOf(tree),
      },
    });

    expect((await snapshot.get()).ok).toBe(false);
    expect((await snapshot.get()).ok, '断る理由が消えた後も同じ断りを配り続けない').toBe(true);
    expect(calls).toBe(2);
  });

  it('重なった呼び出しは 1 度の走査を分け合う', async () => {
    const s = scene();
    s.hold();
    const first = s.snapshot.get();
    const second = s.snapshot.get();
    s.release();
    const [a, b] = await Promise.all([first, second]);
    expect(s.walks, 'クライアントが 3 つ繋がった瞬間に木を 3 回走査しない').toBe(1);
    expect(a).toBe(b);
  });

  it('覚えている 1 枚が在るなら、`stream` は 1 つも配らずにそれを返す', async () => {
    const s = scene();
    await s.snapshot.get();

    const step = await s.snapshot.stream().next();
    if (!step.done) throw new Error('覚えている 1 枚が在るのに、途中経過を配り直した');

    expect(s.walks, '既に全部が在るので走査し直さない').toBe(1);
    /* 返るのは、配らなかった木そのものである。**受け取る側はこれを配る責任を負う** ——
       読み終えたことだけを伝えると、受け取る側は初期値のまま読み終えたことになり、
       プロジェクトが 1 つも無い木を描く。 */
    expect(step.value).toEqual(ok(tree(1000)));
  });

  it('走査が投げても、次の呼び出しで詰まらない', async () => {
    let calls = 0;
    const snapshot = createTreeSnapshot({
      clock: { now: () => 1000 },
      ttlMs: 100,
      observe: {
        execute: async (at) => {
          calls++;
          if (calls === 1) throw new Error('走査できなかった');
          return ok(tree(at));
        },
        observe: streamOf(tree),
      },
    });
    await expect(snapshot.get()).rejects.toThrow('走査できなかった');
    await expect(
      snapshot.get(),
      '走っているというフラグを残したままにしない',
    ).resolves.toBeDefined();
    expect(calls).toBe(2);
  });
});
