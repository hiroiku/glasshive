import {
  mdiAlertOctagonOutline,
  mdiCommentOutline,
  mdiCompassOffOutline,
  mdiFolderSearchOutline,
  mdiGithub,
  mdiLanConnect,
  mdiRhombus,
  mdiSourceBranch,
} from '@mdi/js';
import type { NotObservedProps } from '../components/primitives/NotObserved.tsx';

/* 観測できなかったことを、読める言葉に直す。

   **エラーコードごとに、次にすべきことが違う。** `gh` が入っていないのは入れる話、断られたのは
   入り直す話、時間切れは待つか範囲を狭める話である。同じ「読めませんでした」に潰すと、
   ユーザーは自分が何をすればいいのか分からないまま画面の前に取り残される。

   ここは見え方を決める場所であって、観測そのものではない。知らないコードが来たら、
   知らないと言ったうえでコードを見せる —— 黙って一般論を出すと、当たらない案内で
   時間を使わせる。 */

/** GitHub を尋ねに行けなかった */
export function githubTrouble(code: string | null): NotObservedProps {
  switch (code) {
    case 'tracker.not_installed':
      return {
        icon: mdiGithub,
        title: 'GitHub CLI is not installed',
        detail:
          'glasshive reads GitHub through the gh command, so it never holds a token of its own. There is a repository behind this project — it just has no way to ask about it.',
        code,
        steps: [
          { text: 'Install the GitHub CLI', href: 'https://cli.github.com' },
          { text: 'Sign in once', command: 'gh auth login' },
        ],
      };
    case 'tracker.denied':
      return {
        icon: mdiGithub,
        title: 'GitHub refused the request',
        detail:
          'gh is installed and answered, but GitHub would not serve this repository. That is usually an expired login, or a token without access to a private repository.',
        code,
        steps: [
          { text: 'See who gh thinks you are', command: 'gh auth status' },
          { text: 'Sign in again if the token expired', command: 'gh auth login' },
        ],
      };
    /* `gh` は答えたが、その答えから課題へ辿れなかった。**「届かなかった」と言わない** ——
       いちばん多い引き金は認証の切れた `{"errors":[{"message":"Bad credentials"}]}` で、
       すべきことは断られたときと同じ入り直しである。 */
    case 'tracker.unreadable_response':
      return {
        icon: mdiGithub,
        title: 'GitHub answered with something that is not an issue list',
        detail:
          'gh ran and came back, but the answer holds no issues to read — an expired login and a GraphQL error both look like this. Nothing is known about the issues in this repository right now; this is not an empty backlog.',
        code,
        steps: [
          { text: 'See who gh thinks you are', command: 'gh auth status' },
          { text: 'Sign in again if the token expired', command: 'gh auth login' },
          { text: 'Ask for the issues by hand to see what comes back', command: 'gh issue list' },
        ],
      };
    case 'tracker.timeout':
      return {
        icon: mdiLanConnect,
        title: 'GitHub did not answer in time',
        detail:
          'The request was sent and never came back. Nothing is known about the issues in this repository right now — this is not an empty backlog.',
        code,
        steps: [
          { text: 'Run the same query by hand to see where it stalls', command: 'gh issue list' },
          { text: 'Check whether GitHub itself is degraded', href: 'https://www.githubstatus.com' },
        ],
      };
    case 'tracker.exit_nonzero':
      return {
        icon: mdiGithub,
        title: 'gh exited with an error',
        detail:
          'gh started and stopped with a non-zero status. It knows why; glasshive only sees the exit code. Running the same command by hand prints the reason.',
        code,
        steps: [{ text: 'Run it yourself in this project', command: 'gh issue list' }],
      };
    default:
      return {
        icon: mdiGithub,
        title: 'Could not reach GitHub',
        detail:
          'The request to gh did not produce an answer glasshive could read. The code below is what came back — nothing is known about the issues in this repository right now.',
        code,
      };
  }
}

/** `git` を見に行けなかった */
export function gitTrouble(code: string | null): NotObservedProps {
  switch (code) {
    case 'git.not_installed':
      return {
        icon: mdiSourceBranch,
        title: 'git is not installed',
        detail:
          'glasshive shells out to git for branches, worktrees and conflicts. Without it, every project looks like it has no repository — which is not what is being said here.',
        code,
        steps: [{ text: 'Install git', href: 'https://git-scm.com/downloads' }],
      };
    case 'git.denied':
      return {
        icon: mdiSourceBranch,
        title: 'git refused to read this repository',
        detail:
          'The directory exists and git ran, but it would not answer. On a shared or mounted checkout this is usually ownership: git declines repositories owned by another user. The repository is there — this is not an empty or missing one.',
        code,
        steps: [
          { text: 'Ask git what it objects to', command: 'git status' },
          {
            text: 'If it is ownership, trust this checkout',
            command: 'git config --global --add safe.directory <path>',
          },
        ],
      };
    case 'git.timeout':
      return {
        icon: mdiSourceBranch,
        title: 'git did not finish in time',
        detail:
          'The command was started and never returned. A very large history or a stalled network remote can do this.',
        code,
      };
    case 'git.exit_nonzero':
      return {
        icon: mdiSourceBranch,
        title: 'git exited with an error',
        detail:
          'git ran and stopped with a non-zero status, and what it printed is not a refusal or a missing repository. It knows why; glasshive only sees that it failed. Running the same command by hand prints the reason.',
        code,
        steps: [{ text: 'Run it yourself in this project', command: 'git status' }],
      };
    default:
      return {
        icon: mdiSourceBranch,
        title: 'Could not read the repository',
        detail:
          'git did not produce an answer glasshive could read. The code below is what came back.',
        code,
      };
  }
}

/* 呼び出し自体が届かなかった。**向こうの都合ではなく、こちら側の話である。**
   `gh` や `git` の案内を出すと、直す先を間違えさせる。 */
export function transportTrouble(what: string): NotObservedProps {
  return {
    icon: mdiLanConnect,
    title: `Could not ask glasshive for ${what}`,
    detail:
      'The request to the local glasshive server did not come back. The page is still open but the server behind it is not answering — this says nothing about your repository.',
    steps: [
      { text: 'Check the terminal glasshive is running in' },
      { text: 'Reload once the server is back' },
    ],
  };
}

/* この URL が指すプロジェクトを観測していない。**壊れているのではなく、居ない。**

   `~/.claude/projects` の下に無いディレクトリを URL に書くとここへ来る。タブに残った
   古いリンクを開いたときと、名前を変えた後がほとんどで、どちらも直し方は同じである。 */
export function projectTrouble(slug: string): NotObservedProps {
  return {
    icon: mdiFolderSearchOutline,
    title: 'No project by that name',
    detail:
      'glasshive lists whatever it finds under ~/.claude/projects, and nothing there answers to this name. A renamed or removed directory leaves a link like this behind — the link is stale, the tool is fine.',
    code: slug,
    steps: [
      { text: 'Open the overview and pick a project that is actually there' },
      { text: 'See what glasshive can see', command: 'ls ~/.claude/projects' },
    ],
  };
}

/* プロジェクトの一覧そのものが読めなかった。**プロジェクトの話ではない** ——
   `~/.claude/projects` を開けなかったか、ローカルのサーバーが答えなかったかである。 */
export function treeTrouble(): NotObservedProps {
  return {
    icon: mdiFolderSearchOutline,
    title: 'Could not read the transcripts directory',
    detail:
      'glasshive reads every session from ~/.claude/projects. That read did not come back, so the list below is not empty — it is unknown.',
    steps: [
      { text: 'Check that the directory is readable', command: 'ls -la ~/.claude/projects' },
      { text: 'Check the terminal glasshive is running in' },
    ],
  };
}

/* `ref` を見に行けなかった。`git` の断りと、その `ref` が無いことは別である */
export function refTrouble(code: string | null): NotObservedProps {
  if (code === null) {
    return {
      icon: mdiSourceBranch,
      title: 'Nothing at that ref',
      detail:
        'git ran and answered, and there are no commits under this name. A deleted branch, a squashed worktree, or a tag that never landed all look like this.',
      steps: [{ text: 'Ask git yourself', command: 'git log --oneline -5 <ref>' }],
    };
  }
  return gitTrouble(code);
}

/* 課題 1 件を開けなかった。**取ってきた一覧に居ない、が答えのことがある** ——
   一覧を取った後に立てられた課題がそれで、失敗ではない。 */
export function issueTrouble(id: string, code: string | null): NotObservedProps {
  if (code !== null) {
    return {
      icon: mdiRhombus,
      title: 'Could not read this issue',
      detail:
        'The request came back with an error instead of the issue. The code below is what came back.',
      code,
    };
  }
  return {
    icon: mdiRhombus,
    title: 'This issue is not in view',
    detail: `The issues fetched from GitHub for this project do not include ${id}. It may have been created after this page loaded, or it may live in another project.`,
    code: id,
    steps: [
      { text: 'Reload to fetch the issues again' },
      { text: 'Check that the project on the tab is the one that owns this id' },
    ],
  };
}

/* 会話の続きが読めなかった。**`transcript` が消えたわけではない** ——
   ページの求めがローカルのサーバーまで届かなかったか、途中で切れたかである。 */
export function conversationTrouble(): NotObservedProps {
  return {
    icon: mdiCommentOutline,
    title: 'Could not read more of this conversation',
    detail:
      'The transcript is read in windows as you scroll, and this window did not come back. What is already on screen is still what was written — only the part beyond it is unknown.',
    steps: [
      { text: 'Scroll again to retry' },
      { text: 'Check the terminal glasshive is running in' },
    ],
  };
}

/* 画面そのものが落ちた。**観測できなかったのとは違う** —— ここまで来たら、glasshive の側の
   誤りである。何も推し量らずに、投げられたものをそのまま見せて、次にすべきことを添える。 */
export function crashTrouble(error: unknown): NotObservedProps {
  const message = error instanceof Error ? error.message : String(error);
  return {
    icon: mdiAlertOctagonOutline,
    title: 'This view stopped',
    detail:
      'Something in glasshive itself threw while drawing this view. Nothing was written anywhere — glasshive only reads — so reloading is safe.',
    code: message === '' ? null : message,
    steps: [
      { text: 'Reload the page' },
      { text: 'Check the terminal glasshive is running in for the full trace' },
    ],
  };
}

/* そのような画面は無い。URL を手で書いたか、古いブックマークを開いたかである */
export function routeTrouble(pathname: string): NotObservedProps {
  return {
    icon: mdiCompassOffOutline,
    title: 'No such page',
    detail:
      'glasshive has an overview of every project, and per-project Agents and Work views. This address is none of them.',
    code: pathname,
    steps: [{ text: 'Pick a project from the Overview tab above' }],
  };
}
