/* 同一のプロジェクトが複数の slug に分かれることがあるので、1 つにまとめる。

   パスの書き表し方は揺れる(リンクされたパスなどで、同じ実体が別の表記になる)。
   その揺れを正規化するのは解決済みのパスで、**解決そのものは外側で済ませて渡す。**
   ここは文字列の比較しかしないので、ディスクの都合に左右されない。 */

/** まとめる前のプロジェクト 1 つ */
export interface MergeableProject<S> {
  readonly slug: string;
  /** `transcript` に書かれていた作業ディレクトリ。手を加えない */
  readonly path: string | null;
  /** 解決済みのパス。解決に失敗したなら null で、そのときは path で測る */
  readonly canonicalPath: string | null;
  readonly latestActivityMs: number;
  readonly sessions: readonly S[];
}

/** まとめた後のプロジェクト 1 つ */
export interface MergedProject<S> {
  readonly id: string;
  readonly slugs: readonly string[];
  /* 代表が `transcript` に書いていた作業ディレクトリ。**人に見せるための表記である。**

     プロセスの帰属をこれで測ってはいけない。組の中のどれが代表になるかは slug の辞書順で
     決まるので、まとまった slug のうち「解決前の表記」がどれになるかは選べない。
     OS が教える作業ディレクトリは解決済みなので、突き合わせるなら `canonicalPath` を使う。 */
  readonly path: string | null;
  /* 組を作ったパス。**プロセスの帰属はこちらで測る。**

     代表が誰になっても動かない。slug でしか組めなかったときだけ null になる。 */
  readonly canonicalPath: string | null;
  readonly latestActivityMs: number;
  readonly sessions: readonly S[];
}

interface Group<S> {
  /** 代表。組の中で辞書順の最も小さい slug を持つもの */
  representative: MergeableProject<S>;
  /* 組を作ったパス。slug で組んだときだけ null。

     **代表とは別に持つ。** 代表は slug の辞書順で入れ替わるので、そちらから採ると
     プロセスの帰属に使うパスが、slug の付き方しだいで消えたり変わったりしてしまう。 */
  location: string | null;
  slugs: string[];
  latestActivityMs: number;
  sessions: S[];
}

/* 組を作るパス。解決済みのパスが在ればそれ、無ければ生のパス。

   **解決に失敗しても、slug まで落ちない。** パスが分かっているのに slug で測ると、
   同じパスを指す別 slug のプロジェクトがまとまらなくなる。解決の失敗は「揺れを正規化できなかった」
   だけで、「パスが分からない」ではない。渡す側の作法に頼らず、ここで落とし方を決める。 */
const locationOf = (raw: MergeableProject<unknown>): string | null => raw.canonicalPath ?? raw.path;

/* まとめるためのキー。パスで測れるならそれ、測れないときだけ slug で測る。

   `slug:` を前に置くのは、キーの空間を分けておくためである。パスと slug が
   たまたま同じ文字列になったときに、別の実体がまとまってしまうことを避ける。 */
const keyOf = (raw: MergeableProject<unknown>): string => locationOf(raw) ?? `slug:${raw.slug}`;

/* 解決済みのパスが同じものを 1 つにまとめる。

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
