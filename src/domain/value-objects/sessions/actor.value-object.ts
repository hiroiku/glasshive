/* 誰がこのセッションを回しているか。

   セッションの開始時に差し込まれる `mgr-XXXXXXXX` という名前を、正本の本文から拾う。
   決まった欄には入っていないので、字面を探すよりほかにない。 */

const ACTOR = /mgr-[0-9a-f]{8}/;

export function scanActorId(text: string): string | null {
  return ACTOR.exec(text)?.[0] ?? null;
}
