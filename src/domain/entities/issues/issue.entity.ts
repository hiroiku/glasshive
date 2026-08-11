import type { GithubIssueExtra } from './github-issue.entity.ts';

/* 課題台帳の中身。

   欄の中身を決めるのは GitHub で、こちらは読むだけである。こちらの型に合わない欄は
   「無い」として扱う。

   **一覧は本文を載せない** — 本文は際限なく大きくなり得るもので、数百件ぶんを一度に運ぶと
   一覧そのものが開かなくなる。本文が要るのは 1 件を開いたときだけなので、そのときに別の
   呼び出しで尋ねる。 */

/** 課題どうしの繋がり 1 本。「この課題が `on` に掛かっている」という向き */
export interface IssueDependency {
  /** 掛かっている先の課題。相手を名指せなければ無い */
  readonly on: string | null;
  /** `blocks` か `parent-child`。画面はこの種類で入れ子と依存の辺を組む */
  readonly type: string | null;
}

/** 一覧に出す 1 件。本文は持たない */
export interface IssueSummary {
  /** `#<番号>` の形。番号を読めなかった課題は一覧に入れないので、必ず在る */
  readonly id: string;
  readonly title: string | null;
  /* 状態は必ず文字列で持つ。書かれていなければ空文字列にする —
     `null` にすると、集計のキーが 2 種類になって件数が割れる。 */
  readonly status: string;
  readonly issueType: string | null;
  readonly labels: readonly string[] | null;
  readonly assignee: string | null;
  readonly createdAt: string | null;
  readonly updatedAt: string | null;
  /* 閉じた時刻。開いている課題には無い。

     **`updatedAt` で代用しない。** 閉じた後に誰かが書き込めば `updatedAt` は先へ進むので、
     代用すると閉じた課題ほど長く掛かったように見える。 */
  readonly closedAt: string | null;
  readonly deps: readonly IssueDependency[];
  /* 掛かっている先を全部見られたか。

     GitHub は 1 件あたりの依存にも上限を掛けて返すので、上限に当たれば辺が足りない。
     依存の総数を尋ねていない応答も、足りていないものとして扱う。**足りないまま「これが
     全部だ」と描かない** — 依存グラフで 1 本欠けた絵は、着手できないものを着手できると言う。 */
  readonly depsComplete: boolean;
  /** `IssueSummary` の欄に写す先が無かった、GitHub にしか無いものをまとめたもの */
  readonly github: GithubIssueExtra;
}

/** 台帳ひとつぶんの観測 */
export interface IssueLedger {
  readonly issues: readonly IssueSummary[];
  /* 状態ごとの件数。**一覧から落とした課題も、ここには数える。**
     閉じたものを隠していても「いくつ閉じたか」はユーザーに見せるためである。 */
  readonly counts: Readonly<Record<string, number>>;
  /* 上限に当たって、その先を読んでいないか。

     GitHub は 1 ページに返す件数を絞るので、こちらは何ページか辿ることになる。辿るページ数に
     置いた上限に当たったときと、途中のページで `gh` が答えなくなったときに `true` になる。
     **黙って切ると、上限より後ろの課題が「無かった」ことになる** — glasshive が最も
     ついてはいけない嘘である。 */
  readonly truncated: boolean;
}
