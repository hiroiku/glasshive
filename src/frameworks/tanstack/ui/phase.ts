/* 呼吸の位相を、時計そのものから決める。

   点の明滅を要素ごとに始めると、描き直しのたびに位相がばらけて、画面が騒がしくなる。
   始まりを「今が周期のどこか」から逆算して負の遅れとして与えると、いつ現れた点も
   同じ息づかいに揃う。 */

export const PULSE_MS = 1600;

export const pulseDelay = (nowMs: number): string => `-${nowMs % PULSE_MS}ms`;

/* 変わった行にだけ、一撃の光を当てる。

   観測は絶えず入れ替わるので、全部を光らせると画面が点滅するだけになる。
   **意味のある欄の指紋を比べ、実際に変わった行にだけ当てる。**

   React の状態にしないのは、光は 0.7 秒で消える見た目だけの出来事だからである。
   状態に載せると、行が 1 つ変わるたびに表全体を描き直すことになる。 */

export const POP_MS = 700;

const fingerprints = new Map<string, string>();
const poppedAt = new Map<string, number>();

/* 指紋を突き合わせる。**初めて見た行は光らせない。**
   絞り込みを切り替えただけで現れた行が、変わったものとして一斉に光る。 */
export function touchFingerprint(
  id: string,
  fingerprint: string,
  first: boolean,
  nowMs: number,
): void {
  const previous = fingerprints.get(id);
  if (!first && previous !== undefined && previous !== fingerprint) poppedAt.set(id, nowMs);
  fingerprints.set(id, fingerprint);
}

/** 消えた光を落とす。落とさないと、開けっ放しの窓で覚えが増え続ける */
export function prunePops(nowMs: number): void {
  for (const [id, at] of poppedAt) if (nowMs - at > POP_MS) poppedAt.delete(id);
}

/* 光の進み具合。途中から現れた行にも、経過ぶんだけ負の遅れを与えて途中から見せる。
   与えないと、描き直しのたびに光が最初からやり直しになる。 */
export function popStyleOf(id: string, nowMs: number): { animationDelay: string } | null {
  const at = poppedAt.get(id);
  if (at === undefined) return null;
  const elapsed = nowMs - at;
  return elapsed < POP_MS ? { animationDelay: `-${elapsed}ms` } : null;
}
