import type { GithubLabel } from './github-issue.entity.ts';

/* 課題 1 件のやり取り。コメントと、GitHub の `timeline` に並ぶイベントを 1 つの並びで持つ。

   `github-issue.entity.ts` と分けてあるのは、あちらが「一覧の 1 行に写す先が無かった欄」を
   まとめた場所だからである。こちらは 1 件を開いたときにだけ読む別の観測で、`IssueSummary`
   とは何も共有しない。

   種類ごとに欄が違うので `kind` の直和で持つ。**画面が switch を書き切れる形にしておく** —
   共通の欄だけを持つ 1 つの型にすると、どのイベントが何を持っているかが型から消えて、
   描く側が毎回 `null` 検査をすることになる。 */

/** やり取りが名指す課題や PR。番号を読めなければ、何を指したのか言えないので持たない */
export interface GithubIssueReference {
  readonly number: number;
  readonly title: string | null;
}

/** どのイベントも持つもの */
interface DiscussionEntryBase {
  /** GitHub の `createdAt` をそのまま持つ ISO 8601 の文字列 */
  readonly at: string;
  /** 起こした人の `login`。消えたユーザーや `null` を返す相手もいるので、無いことがある */
  readonly actor: string | null;
}

export type GithubIssueDiscussionEntry =
  | (DiscussionEntryBase & {
      readonly kind: 'comment';
      /* 書かれたままの Markdown。**空文字列と `null` は別である** — 空文字列は本文の無い
         コメントで、`null` は応答から本文を読めなかったことを指す。 */
      readonly body: string | null;
    })
  | (DiscussionEntryBase & {
      readonly kind: 'closed';
      /** `COMPLETED` / `NOT_PLANNED` / `DUPLICATE`。GitHub が付けていなければ無い */
      readonly reason: string | null;
    })
  | (DiscussionEntryBase & { readonly kind: 'reopened' })
  | (DiscussionEntryBase & { readonly kind: 'labeled'; readonly label: GithubLabel })
  | (DiscussionEntryBase & { readonly kind: 'unlabeled'; readonly label: GithubLabel })
  | (DiscussionEntryBase & { readonly kind: 'assigned'; readonly assignee: string | null })
  | (DiscussionEntryBase & { readonly kind: 'unassigned'; readonly assignee: string | null })
  | (DiscussionEntryBase & {
      readonly kind: 'milestoned';
      /** GitHub が返すのはマイルストーンの題だけで、期限もオブジェクトも付いてこない */
      readonly milestoneTitle: string | null;
    })
  | (DiscussionEntryBase & {
      readonly kind: 'demilestoned';
      readonly milestoneTitle: string | null;
    })
  | (DiscussionEntryBase & {
      readonly kind: 'renamed';
      readonly previousTitle: string | null;
      readonly currentTitle: string | null;
    })
  | (DiscussionEntryBase & {
      readonly kind: 'parent-added';
      readonly parent: GithubIssueReference;
    })
  | (DiscussionEntryBase & {
      readonly kind: 'blocked-by-added';
      /** この課題を堰き止めた相手。GitHub の欄の名前は `blockingIssue` である */
      readonly blockingIssue: GithubIssueReference;
    })
  | (DiscussionEntryBase & {
      readonly kind: 'marked-as-duplicate';
      /** 重複ではないほう。GitHub の欄の名前は `canonical` である */
      readonly canonical: GithubIssueReference;
    })
  | (DiscussionEntryBase & {
      readonly kind: 'cross-referenced';
      /** この課題に触れた課題か PR */
      readonly source: GithubIssueReference;
      /* その PR がマージされたら、この課題が閉じるか。触れただけの参照と、閉じる約束を
         した参照は別のことである。 */
      readonly willCloseTarget: boolean;
    });

/** やり取りひとつぶんの観測 */
export interface GithubIssueDiscussion {
  /** GitHub が返した順のまま持つ。並べ替えると、同じ時刻に並んだイベントの前後が入れ替わる */
  readonly entries: readonly GithubIssueDiscussionEntry[];
  /* 上限に当たって、その先を読んでいないか。

     辿るページ数に置いた上限に当たったときと、途中のページで `gh` が答えなくなったときに
     `true` になる。**黙って切ると、上限より後ろの発言が「無かった」ことになる** —
     誰も言わなかったことと、こちらが読まなかったことは別である。 */
  readonly truncated: boolean;
}
