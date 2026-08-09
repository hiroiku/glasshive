import type { Clock } from '~/app-kernel/clock.ts';
import { ok, type Result } from '~/app-kernel/result.ts';
import type {
  ObserveTreeUseCase,
  ProjectTree,
} from '~/application/use-cases/sessions/observe-tree.use-case.ts';

/* ひと目ぶんの観測を、短い間だけ持っておく。

   窓は 1 つの求めに対して 1 つとは限らない。木・統計・探しはどれも同じ盤面を見ているので、
   そのたびに歩き直すと遅いだけでなく、**答えが食い違う** — 統計に出ている巣が木に無い、
   ということが起こる。1 枚を分け合えば、速さと食い違いの両方が消える。

   持つのは短い間だけである。長く持つと、合図で取り直しても古い盤面が返ってしまう。 */

const DEFAULT_TTL_MS = 1000;

export interface TreeSnapshotService {
  /** 分け合う 1 枚。受理できなかった求めはそのまま持ち回り、分かれ目は外側が持つ */
  get(): Promise<Result<ProjectTree>>;
  /** 合図が来たら捨てる。次の求めで取り直す */
  invalidate(): void;
}

export function createTreeSnapshot(deps: {
  readonly observe: ObserveTreeUseCase;
  readonly clock: Clock;
  readonly ttlMs?: number;
}): TreeSnapshotService {
  const ttlMs = deps.ttlMs ?? DEFAULT_TTL_MS;
  let cachedAtMs = Number.NEGATIVE_INFINITY;
  let cached: ProjectTree | undefined;
  /* 走っている観測を覚えておき、重なった求めには同じものを渡す。
     覚えていないと、窓が 3 つ開いた瞬間に木を 3 回歩くことになる。 */
  let inFlight: Promise<Result<ProjectTree>> | undefined;
  /* 合図が来た回数。**走り始めたときの数と突き合わせる。**
     数えていないと、走っている最中に来た合図が、走り終えた瞬間に上書きで消える。 */
  let signals = 0;

  return {
    async get() {
      const nowMs = deps.clock.now();
      if (cached !== undefined && nowMs - cachedAtMs < ttlMs) return ok(cached);
      if (inFlight !== undefined) return inFlight;

      const startedAt = signals;
      const running = deps.observe.execute(nowMs);
      inFlight = running;
      try {
        const result = await running;
        /* 断りは覚えない。覚えると、断る理由が消えた後も同じ断りを配り続ける。

           走っている間に合図が来ていたら、この答えは合図より前の盤面である。
           覚えると、変わったと知らされた後の求めに古い盤面を返し続けることになる。 */
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
