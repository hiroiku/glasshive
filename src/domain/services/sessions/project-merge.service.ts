/* 同じ実体の巣が複数の名前に分かれることがあるので、1 つに併せる。

   場所の書き表し方は揺れる(連結された場所などで、同じ実体が別の字面になる)。
   その揺れを均すのは解決済みの場所で、**解決そのものは外側で済ませて渡す。**
   ここは字の比較しかしないので、ディスクの都合に左右されない。 */

/** 併せる前の巣 1 つ */
export interface MergeableProject<S> {
  readonly slug: string;
  /** 正本に書かれていた作業場所。手を加えない */
  readonly path: string | null;
  /** 解決済みの場所。解決に失敗したなら null で、そのときは path で測る */
  readonly canonicalPath: string | null;
  readonly latestActivityMs: number;
  readonly sessions: readonly S[];
}

/** 併せた後の巣 1 つ */
export interface MergedProject<S> {
  readonly id: string;
  readonly slugs: readonly string[];
  /* 代表が正本に書いていた作業場所。**人に見せるための字面である。**

     道具の帰属をこれで測ってはいけない。組の中のどれが代表になるかは名前の辞書順で
     決まるので、併さった別名のうち「解決前の字面」がどれになるかは選べない。
     OS が教える作業場所は解決済みなので、突き合わせるなら canonicalPath を使う。 */
  readonly path: string | null;
  /* 組を作った場所。**道具の帰属はこちらで測る。**

     代表が誰になっても動かない。名前でしか組めなかったときだけ null になる。 */
  readonly canonicalPath: string | null;
  readonly latestActivityMs: number;
  readonly sessions: readonly S[];
}

interface Group<S> {
  /** 代表。組の中で辞書順の最も小さい slug を持つもの */
  representative: MergeableProject<S>;
  /* 組を作った場所。名前で組んだときだけ null。

     **代表とは別に持つ。** 代表は名前の辞書順で入れ替わるので、そちらから採ると
     道具の帰属に使う場所が、名前の付き方しだいで消えたり変わったりしてしまう。 */
  location: string | null;
  slugs: string[];
  latestActivityMs: number;
  sessions: S[];
}

/* 組を作る場所。解決済みの場所が在ればそれ、無ければ生の場所。

   **解決に失敗しても、名前まで落ちない。** 場所が分かっているのに名前で測ると、
   同じ場所を指す別名の巣が併さらなくなる。解決の失敗は「揺れを均せなかった」だけで、
   「場所が分からない」ではない。渡す側の作法に頼らず、ここで落とし方を決める。 */
const locationOf = (raw: MergeableProject<unknown>): string | null => raw.canonicalPath ?? raw.path;

/* 併せる鍵。場所で測れるならそれ、測れないときだけ名前で測る。

   `slug:` を前に置くのは、鍵の空間を分けておくためである。場所と名前が
   たまたま同じ字になったときに、別の実体が併さってしまうことを避ける。 */
const keyOf = (raw: MergeableProject<unknown>): string => locationOf(raw) ?? `slug:${raw.slug}`;

/* 解決済みの場所が同じものを 1 つに併せる。

   出てくる順は、最初に現れた組の順を保つ。並べ直しは呼ぶ側の仕事である。
   セッションも連結するだけで、並べ替えない。 */
export function mergeProjects<S>(
  raws: readonly MergeableProject<S>[],
): readonly MergedProject<S>[] {
  const groups: Group<S>[] = [];
  const index = new Map<string, number>();
  for (const raw of raws) {
    const key = keyOf(raw);
    const at = index.get(key);
    const group = at === undefined ? undefined : groups[at];
    if (group === undefined) {
      index.set(key, groups.length);
      groups.push({
        representative: raw,
        location: locationOf(raw),
        slugs: [raw.slug],
        latestActivityMs: raw.latestActivityMs,
        sessions: [...raw.sessions],
      });
      continue;
    }
    group.slugs.push(raw.slug);
    group.latestActivityMs = Math.max(group.latestActivityMs, raw.latestActivityMs);
    group.sessions.push(...raw.sessions);
    // 代表は辞書順で決める。読む順で結果が変わると、同じ観測が二度と再現しない
    if (raw.slug < group.representative.slug) group.representative = raw;
  }
  return groups.map((group) => ({
    id: group.representative.slug,
    slugs: [...group.slugs].sort(),
    path: group.representative.path,
    canonicalPath: group.location,
    latestActivityMs: group.latestActivityMs,
    sessions: group.sessions,
  }));
}
