import type { Clock } from '~/app-kernel/clock.ts';
import { ok, type Result } from '~/app-kernel/result.ts';
import type {
  ObserveTreeUseCase,
  ProjectTree,
  TreeDelta,
} from '~/application/use-cases/sessions/observe-tree.use-case.ts';

/* スナップショット 1 つを、短い間だけ持っておく。

   1 つの画面が投げる呼び出しは 1 つとは限らない。木・統計・検索はどれも同じスナップショットを
   見ているので、そのたびに走査し直すと遅いだけでなく、**結果が食い違う** — 統計に出ている
   プロジェクトが木に無い、ということが起こる。1 枚を分け合えば、速さと食い違いの両方が消える。

   持つのは短い間だけである。長く持つと、変更通知で取り直しても古いスナップショットが
   返ってしまう。 */

const DEFAULT_TTL_MS = 1000;

export interface TreeSnapshotService {
  /** 分け合う 1 枚。受理できなかった呼び出しはそのまま持ち回り、分かれ目は外側が持つ */
  get(): Promise<Result<ProjectTree>>;
  /* 読めたところから順に配る。

     **走査そのものは呼ぶ側の汲み取りに縛らない。** 縛ると、1 つのブラウザーのタブが
     ゆっくり読むあいだ、`git` も課題も会話も同じ走査を待つことになる。ここは走らせきる
     `get()` を裏で回し、配るのはその途中経過である。 */
  stream(): AsyncGenerator<TreeDelta, Result<ProjectTree>, void>;
  /** 変更通知が来たら捨てる。次の呼び出しで取り直す */
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
  /* 走っている観測を覚えておき、重なった呼び出しには同じものを渡す。
     覚えていないと、呼び出しが 3 つ重なった瞬間に木を 3 回走査することになる。 */
  let inFlight: Promise<Result<ProjectTree>> | undefined;
  /* 変更通知が来た回数。**走り始めたときの数と突き合わせる。**
     数えていないと、走っている最中に来た変更通知が、走り終えた瞬間に上書きで消える。 */
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

           走っている間に変更通知が来ていたら、この結果は通知より前のスナップショットである。
           覚えると、変わったと知らされた後の呼び出しに古いスナップショットを返し続ける
           ことになる。 */
        if (result.ok && signals === startedAt) {
          cached = result.value;
          cachedAtMs = nowMs;
        }
        return result;
      } finally {
        inFlight = undefined;
      }
    },
    async *stream() {
      const nowMs = deps.clock.now();
      /* 覚えている 1 枚が在るなら、読み直さずにそれを返す。**途中経過を配らない。**
         既に全部が在るのに小出しにすると、2 枚目のタブだけが遅く見える。 */
      if (cached !== undefined && nowMs - cachedAtMs < ttlMs) return ok(cached);

      const startedAt = signals;
      /* **`inFlight` に載せない。** 載せると、このストリームを汲む速さがそのまま
         `get()` を待たせる速さになる。ブラウザーのタブが 1 枚ゆっくり読んでいる間、
         `git` も課題も会話も同じ走査を待つことになってしまう。
         読み取りそのものは `transcript` ごとに覚えてあるので、重なっても開き直さない。 */
      const running = deps.observe.observe(nowMs);
      let step = await running.next();
      while (!step.done) {
        yield step.value;
        step = await running.next();
      }
      // 走っている間に変更通知が来ていたら、この結果は通知より前のスナップショットである
      if (step.value.ok && signals === startedAt) {
        cached = step.value.value;
        cachedAtMs = nowMs;
      }
      return step.value;
    },

    invalidate() {
      signals += 1;
      cached = undefined;
      cachedAtMs = Number.NEGATIVE_INFINITY;
    },
  };
}
