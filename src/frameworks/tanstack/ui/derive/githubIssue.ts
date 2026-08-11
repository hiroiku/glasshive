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

/* 課題の型に GitHub が割り当てた色。

   ラベルの色は 16 進数で返るのでそのまま渡せるが、型の色は `IssueTypeColor` の enum 名
   (`RED` など)で返るので、ここで引き当てる。**引き当てるのは画面の側の仕事である** ——
   GitHub が言っているのは「この型を赤に置いている」までで、その赤をこの画面の背景と
   どの濃さで混ぜるかは表示の判断になる。

   知らない名前が来たら色を決めない。手近な色を当てると、GitHub が別の色で見せている型を
   こちらが勝手に塗り替えることになる。 */
const TYPE_COLORS: Readonly<Record<string, string>> = {
  GRAY: '#94a3b8',
  BLUE: '#60a5fa',
  GREEN: '#34d399',
  YELLOW: '#fbbf24',
  ORANGE: '#fb923c',
  RED: '#f87171',
  PINK: '#f472b6',
  PURPLE: '#c084fc',
};

/** 引けなければ `null`。呼ぶ側は色を付けずに描く */
export function issueTypeColor(issue: IssueSummaryJson): string | null {
  const name = issue.github?.issue_type_color;
  if (name == null) return null;
  return TYPE_COLORS[name] ?? null;
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
