/* 平らに並んだサブエージェントを、呼んだ親の下へ入れ直す。

   `~/.claude/projects` は階層を持たない — サブエージェントはどの深さで生まれても
   同じディレクトリに並ぶ。誰が誰を呼んだかは `*.meta.json` にしか書かれていないので、
   木の形はここで組む。

   **親が居ないものは根として扱う。** `*.meta.json` を読めなかったサブエージェントも、
   呼んだ親が観測の範囲の外へ落ちたものも、消えるのではなく深さ 1 に出る。木から外すと、
   ユーザーには「そのサブエージェントは動いていない」としか見えない。 */

export interface Lineage {
  readonly id: string;
  readonly parentId: string | null;
}

export interface Placed<T> {
  readonly node: T;
  readonly depth: number;
}

/* 親のすぐ下に子を置き、その順に並べ直す。深さは根を 1 とする。

   同じ親を持つ者どうしの並びは、渡された順のまま保つ —
   ここは形を決める役で、何を先に見せるかを決めるのは呼ぶ側だからである。 */
export function placeByLineage<T extends Lineage>(nodes: readonly T[]): readonly Placed<T>[] {
  const known = new Set(nodes.map((node) => node.id));
  const children = new Map<string | null, T[]>();

  for (const node of nodes) {
    // 呼んだ親がこの並びに居ないなら、根として扱う
    const parent = node.parentId !== null && known.has(node.parentId) ? node.parentId : null;
    const bucket = children.get(parent);
    if (bucket === undefined) children.set(parent, [node]);
    else bucket.push(node);
  }

  const placed: Placed<T>[] = [];
  const seen = new Set<string>();

  const walk = (parent: string | null, depth: number): void => {
    for (const node of children.get(parent) ?? []) {
      /* `*.meta.json` が循環していても止まる。循環の中の 1 つを根に見立てて置き、
         二度目からは降りない — 観測したデータを信じて回り続けるわけにはいかない。 */
      if (seen.has(node.id)) continue;
      seen.add(node.id);
      placed.push({ node, depth });
      walk(node.id, depth + 1);
    }
  };

  walk(null, 1);

  // 循環に入っていて一度も置かれなかったものを、根として拾い上げる
  for (const node of nodes) {
    if (seen.has(node.id)) continue;
    seen.add(node.id);
    placed.push({ node, depth: 1 });
  }

  return placed;
}
