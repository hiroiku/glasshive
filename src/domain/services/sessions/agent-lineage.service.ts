/* 平らに並んだ子を、呼んだ相手の下へ入れ直す。

   正本の置き場は段を持たない — 子は何段目で産まれても同じ棚に並ぶ。
   誰が誰を呼んだかは覚え書きにしか書かれていないので、木の形はここで組む。

   **親が居ないものは根として扱う。** 覚え書きを読めなかった子も、呼んだ相手が
   窓の外へ落ちた子も、消えるのではなく段 1 に出る。木から外すと、
   観る人には「そんな子は動いていない」としか見えない。 */

export interface Lineage {
  readonly id: string;
  readonly parentId: string | null;
}

export interface Placed<T> {
  readonly node: T;
  readonly depth: number;
}

/* 親のすぐ下に子を置き、その順に並べ直す。段は根を 1 とする。

   同じ親を持つ者どうしの並びは、渡された順のまま保つ —
   ここは形を決める役で、何を先に見せるかを決めるのは呼ぶ側だからである。 */
export function placeByLineage<T extends Lineage>(nodes: readonly T[]): readonly Placed<T>[] {
  const known = new Set(nodes.map((node) => node.id));
  const children = new Map<string | null, T[]>();

  for (const node of nodes) {
    // 呼んだ相手がこの並びに居ないなら、根として扱う
    const parent = node.parentId !== null && known.has(node.parentId) ? node.parentId : null;
    const bucket = children.get(parent);
    if (bucket === undefined) children.set(parent, [node]);
    else bucket.push(node);
  }

  const placed: Placed<T>[] = [];
  const seen = new Set<string>();

  const walk = (parent: string | null, depth: number): void => {
    for (const node of children.get(parent) ?? []) {
      /* 覚え書きが輪を作っていても止まる。輪の中の 1 つを根に見立てて置き、
         二度目からは降りない — 観測した字を信じて回り続けるわけにはいかない。 */
      if (seen.has(node.id)) continue;
      seen.add(node.id);
      placed.push({ node, depth });
      walk(node.id, depth + 1);
    }
  };

  walk(null, 1);

  // 輪に入っていて一度も置かれなかったものを、根として拾い上げる
  for (const node of nodes) {
    if (seen.has(node.id)) continue;
    seen.add(node.id);
    placed.push({ node, depth: 1 });
  }

  return placed;
}
