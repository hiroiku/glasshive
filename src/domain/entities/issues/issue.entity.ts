/* 課題台帳の中身。

   正本は bd が書き出す `<巣>/.beads/issues.jsonl` で、こちらは読むだけである。
   欄の並びも中身も向こうが決めるので、こちらの型に合わない欄は「無い」として扱う。

   一覧と 1 件で持つものが違う。**一覧は `description` を載せない** — 本文は際限なく
   大きくなり得るもので、数百件ぶんを一度に運ぶと一覧そのものが開かなくなる。 */

/** 課題どうしの繋がり 1 本。「この課題が `on` に掛かっている」という向き */
export interface IssueDependency {
  /** 掛かっている先の課題。台帳が字で書いていなければ無い */
  readonly on: string | null;
  /** `blocks` や `parent-child` など。字は台帳の書き方に従う */
  readonly type: string | null;
}

/** 一覧に出す 1 件。本文は持たない */
export interface IssueSummary {
  readonly id: string | null;
  readonly title: string | null;
  /* 状態は必ず字で持つ。書かれていなければ空の字にする —
     `null` にすると、数えるときの鍵が二種類になって札が割れる。 */
  readonly status: string;
  readonly priority: number | null;
  readonly issueType: string | null;
  readonly labels: readonly string[] | null;
  readonly assignee: string | null;
  readonly owner: string | null;
  readonly createdAt: string | null;
  readonly updatedAt: string | null;
  readonly deps: readonly IssueDependency[];
}

/* 1 件を引いたときの記録。台帳に書かれていた欄をそのまま持つ。

   本文・受け入れ条件・覚え書き・言葉のやり取りまで、欄はどれも向こうが増やせる。
   こちらで欄を選ぶと、増えた欄が黙って消えるので、記録そのものを渡す。 */
export type IssueRecord = Readonly<Record<string, unknown>>;

/** 台帳ひとつぶんの観測 */
export interface IssueLedger {
  readonly issues: readonly IssueSummary[];
  /* 状態ごとの件数。**一覧から落とした課題も、ここには数える。**
     閉じたものを隠していても「いくつ閉じたか」は観る人に見せるためである。 */
  readonly counts: Readonly<Record<string, number>>;
}
