/* GitHub にしか無い欄。

   ここに置くのは**`IssueSummary` に写す先が無かったものだけ**である。id・題・状態・依存は
   `IssueSummary` の欄として写してあるので、こちらには入らない。そうしておくと、一覧も
   入れ子も依存の辺も blocked の判定も、`IssueSummary` だけを見て描ける。 */

/** ラベル 1 つ。色は GitHub 側が付けた意味なので、こちらで塗り直さない */
export interface GithubLabel {
  readonly name: string;
  /** `#` の付かない 6 桁。読めなければ無い */
  readonly color: string | null;
}

/* 人 1 人。

   顔の URL は持つが、**これをブラウザーへ渡してはいけない。** 渡した瞬間に画面が
   GitHub の CDN へ直に取りに行き、「機械から出ていくのは自分の課題を読みに行くこと 1 つだけ」
   という約束が画面の側から崩れる。渡すのは、こちらで読んだ先を指す同じ origin の URL である。 */
export interface GithubActor {
  readonly login: string;
  readonly avatarUrl: string | null;
}

export interface GithubMilestone {
  readonly title: string;
  /** 期限。決めていないマイルストーンもある */
  readonly dueOn: string | null;
}

/* この課題を閉じる PR。

   `state` と `isDraft` は分けて持つ。下書きは「まだ見せるつもりが無い」で、開いた PR は
   「見てくれ」である。同じ見た目にすると、待っている相手が読めなくなる。 */
export interface GithubPullRequest {
  readonly number: number;
  /** `OPEN` / `CLOSED` / `MERGED` */
  readonly state: string;
  readonly isDraft: boolean;
  /** `APPROVED` / `CHANGES_REQUESTED` / `REVIEW_REQUIRED`。付いていなければ無い */
  readonly reviewDecision: string | null;
  /* PR が乗っているブランチ。**セッションの `gitBranch` と突き合わせる鍵である。**
     これが在るから「このエージェントが、この PR で、この課題を触っている」と言える。 */
  readonly headRefName: string | null;
}

/* 束ねた課題の消化。

   **取ってきたページに依らない総数である。** 数え直すと、一覧を絞ったぶんだけ
   分母が減って、進んだ束ほど進みが少なく見える。 */
export interface GithubSubIssues {
  readonly total: number;
  readonly completed: number;
}

export interface GithubIssueExtra {
  readonly url: string | null;
  readonly labels: readonly GithubLabel[];
  readonly assignees: readonly GithubActor[];
  readonly author: GithubActor | null;
  readonly milestone: GithubMilestone | null;
  /** 型の色。組織で型を設定していなければ無い。既定の色で埋めない */
  readonly issueTypeColor: string | null;
  readonly subIssues: GithubSubIssues | null;
  readonly pullRequests: readonly GithubPullRequest[];
  readonly comments: number;
  readonly reactions: number;
}
