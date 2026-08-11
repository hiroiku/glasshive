/* 一覧に出ている課題に起きたこと。**時刻と種類だけを持つ。**

   `github-issue-discussion.entity.ts` と同じ出どころ(`timelineItems`)を読むが、持ち帰るものが
   違う。あちらは 1 件を開いた人が読むためのもので、本文も相手の課題も名前も運ぶ。こちらは
   一覧の右の時間軸に点を置くためのもので、要るのは「いつ」と「何が」だけである。100 件ぶんを
   まとめて運ぶので、1 件ぶんの重さがそのまま 100 倍になる。

   種類の言葉は `GithubIssueDiscussionEntry['kind']` と同じものを使う。**同じイベントを 2 つの
   語彙で呼ばない** —— パネルが「ラベルを付けた」と言い、点が別の名前を出したら、同じものだと
   読めなくなる。 */

import type { GithubIssueDiscussionEntry } from './github-issue-discussion.entity.ts';

export interface GithubIssueEvent {
  /** GitHub の `createdAt` をそのまま持つ ISO 8601 の文字列 */
  readonly at: string;
  readonly kind: GithubIssueDiscussionEntry['kind'];
}

/** 課題 1 件に起きたこと */
export interface GithubIssueEvents {
  /** `#<番号>` の形。一覧の行と突き合わせる鍵である */
  readonly id: string;
  /** GitHub が返した順のまま。並べ替えると、同じ時刻に並んだイベントの前後が入れ替わる */
  readonly events: readonly GithubIssueEvent[];
  /* 1 件あたりの上限に当たって、その先を読んでいないか。

     **黙って切ると、読まなかったぶんが「起きなかった」ことになる。** 点が 30 個並んだ課題と、
     141 回のうち 30 回ぶんだけを描いた課題は、同じ絵になってはいけない。 */
  readonly truncated: boolean;
}

/** 一覧ぶんの観測 */
export interface GithubIssueEventLog {
  readonly issues: readonly GithubIssueEvents[];
  /* 一覧の課題を全部辿れたか。

     辿るページ数の上限に当たったときと、途中のページで `gh` が答えなくなったときに `false` に
     なる。ここが `false` なら、一覧に在る課題のうちどこから先を読んでいないかが分かる ——
     読めた課題はイベントが 0 件でも `issues` に並ぶので、並びに居ないことが「読まなかった」
     という観測そのものになる。画面はその 2 つを別の絵で描く。 */
  readonly complete: boolean;
}
