import type {
  GithubPullRequestJson,
  IssueSummaryJson,
} from '~/interface/presenters/issues/issues.presenter.ts';

/* GitHub の課題だけが持つ欄を、画面が使える形にする。

   **「無い」の形をここで 1 つに揃える。** 色の付いていないラベル・PR の無い課題・子を
   持たない課題は、どれも空を返す。欄ごとに空を確かめるのはここ 1 か所に閉じる。 */

/** ラベルの名前から色を引く。色の付いていないラベルは入らない */
export function labelColors(issue: IssueSummaryJson): ReadonlyMap<string, string> {
  const colors = new Map<string, string>();
  for (const label of issue.github?.labels ?? []) {
    if (label.color !== null && label.color !== '') colors.set(label.name, label.color);
  }
  return colors;
}

/* 出す PR を 1 つ選ぶ。

   **開いているものを先に採る。** 課題を閉じた PR は既に済んだ話で、いま読みたいのは
   「この課題は誰の手で進んでいるか」である。開いたものが無ければ、直近に閉じたものを出す。 */
export function leadPullRequest(issue: IssueSummaryJson): GithubPullRequestJson | null {
  const pulls = issue.github?.pull_requests ?? [];
  return pulls.find((pull) => pull.state === 'OPEN') ?? pulls[0] ?? null;
}

/** 束ねた課題の消化。**GitHub が言う総数を優先する** — 取ってきたページに依らない */
export function subProgress(
  issue: IssueSummaryJson,
  counted: { total: number; closed: number } | undefined,
): { total: number; closed: number } | null {
  const summary = issue.github?.sub_issues;
  if (summary !== null && summary !== undefined && summary.total > 0) {
    return { total: summary.total, closed: summary.completed };
  }
  return counted ?? null;
}

/** 名前から 2 文字。顔が読めなかったときに、誰なのかだけは残す */
export const monogram = (login: string): string => {
  const letters = login.replace(/[^A-Za-z0-9]/g, '');
  return (letters === '' ? login : letters).slice(0, 2).toUpperCase();
};
