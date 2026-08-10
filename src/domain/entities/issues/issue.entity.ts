/* 課題台帳の中身。

   台帳の実体は bd が書き出す `<project>/.beads/issues.jsonl` で、こちらは読むだけである。
   欄の並びも中身も向こうが決めるので、こちらの型に合わない欄は「無い」として扱う。

   一覧と 1 件で持つものが違う。**一覧は `description` を載せない** — 本文は際限なく
   大きくなり得るもので、数百件ぶんを一度に運ぶと一覧そのものが開かなくなる。 */

/** 課題どうしの繋がり 1 本。「この課題が `on` に掛かっている」という向き */
export interface IssueDependency {
  /** 掛かっている先の課題。台帳が文字列で書いていなければ無い */
  readonly on: string | null;
  /** `blocks` や `parent-child` など。値は台帳の書き方に従う */
  readonly type: string | null;
}

/** 一覧に出す 1 件。本文は持たない */
export interface IssueSummary {
  readonly id: string | null;
  readonly title: string | null;
  /* 状態は必ず文字列で持つ。書かれていなければ空文字列にする —
     `null` にすると、集計のキーが 2 種類になって件数が割れる。 */
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

   本文・受け入れ条件・メモ(`notes`)・コメントまで、欄はどれも向こうが増やせる。
   こちらで欄を選ぶと、増えた欄が黙って消えるので、記録そのものを渡す。 */
export type IssueRecord = Readonly<Record<string, unknown>>;

/** 台帳ひとつぶんの観測 */
export interface IssueLedger {
  readonly issues: readonly IssueSummary[];
  /* 状態ごとの件数。**一覧から落とした課題も、ここには数える。**
     閉じたものを隠していても「いくつ閉じたか」はユーザーに見せるためである。 */
  readonly counts: Readonly<Record<string, number>>;
}
