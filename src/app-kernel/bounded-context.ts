/* 観測の相手ごとに引いた bounded context。

   **ここが唯一の宣言である。** どの層のディレクトリ名も、この集合に属していなければならない。
   一覧に無い名前でディレクトリを切ると、bounded context が増えたことに誰も気付かないまま、
   同じ言葉が二つの意味を持ち始める。

   分ける拠り所は「観測元が違うか」と「言葉が違うか」で、ファイルの数ではない。 */

export const BOUNDED_CONTEXTS = ['sessions', 'issues', 'git', 'workspace'] as const;

export type BoundedContext = (typeof BOUNDED_CONTEXTS)[number];
