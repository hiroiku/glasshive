import { containsPath, pathDepth, samePath } from '~/app-kernel/path.ts';

/* 名指されたディレクトリが、どのプロジェクトを指すかを決める。

   1 つのリポジトリは、たいてい複数のプロジェクトに割れている。プロジェクトとは Claude Code
   を起こしたディレクトリのことなので、リポジトリの根と、その下の作業ディレクトリと、
   worktree のそれぞれが別の slug になる。**どれのことかを人に尋ねない** —— 打ったのは
   パス 1 つで、そこに選択肢が在ったことを打った人は知らない。

   ここは文字列だけを見る。ディスクにも `git` にも触らないので、選び方そのものを
   ファイルなしで確かめられる。 */

/** 選ぶ相手。**行の識別だけを見る** —— 中身が読めているかどうかは、この選び方に関係しない */
export interface TargetCandidate {
  readonly id: string;
  /** まとめるためのキーに使った、解決済みのパス */
  readonly canonicalPath: string | null;
  /** このプロジェクトの最後の書き込み。同じリポジトリに複数在るときの選び分けに使う */
  readonly latestActivityMs: number;
}

export interface TargetChoice {
  /** ウィンドウに出すプロジェクト。名指した場所に何も観測できていなければ `null` */
  readonly id: string | null;
  /** 同じリポジトリに居る、ほかのプロジェクト。ウィンドウの上に名前を出す相手である */
  readonly others: readonly string[];
}

/* 選ぶ順を 1 つに決める。**最後に書き込まれたものを先に採る** —— 同じリポジトリで
   worktree がいくつも動いているとき、人が見たいのはたいてい直前まで動いていたほうである。
   同じ時刻に並んだときは浅いほう、それも同じなら id の順にする。時刻だけで決めると、
   一度も書き込まれていないプロジェクトどうしの並びが呼ばれるたびに変わる。 */
const byActivity = (a: TargetCandidate, b: TargetCandidate): number =>
  b.latestActivityMs - a.latestActivityMs ||
  pathDepth(a.canonicalPath ?? '') - pathDepth(b.canonicalPath ?? '') ||
  a.id.localeCompare(b.id);

export function chooseTarget(input: {
  /** リポジトリの根。`git` が答えなければ、名指されたパスそのもの */
  readonly root: string;
  /** 同じリポジトリの worktree。根の外に在ることもある */
  readonly worktrees: readonly string[];
  readonly candidates: readonly TargetCandidate[];
}): TargetChoice {
  /* 解決済みのパスを持たないプロジェクトは、どこに在るかが分からない。**場所の話に
     混ぜない** —— 混ぜると、場所の分からないものが名指されたリポジトリの一員になる。 */
  const located = input.candidates.flatMap((candidate) =>
    candidate.canonicalPath === null
      ? []
      : [{ ...candidate, canonicalPath: candidate.canonicalPath }],
  );

  const roots = [input.root, ...input.worktrees];
  const members = located
    .filter((candidate) => roots.some((root) => containsPath(root, candidate.canonicalPath)))
    .sort(byActivity);

  /* 根そのもののプロジェクトが在れば、それがウィンドウの主である。打ったパスがそこを指している
     のだから、動きの多い worktree に持っていかれてはいけない。 */
  const exact = members.find((member) => samePath(member.canonicalPath, input.root));
  const primary = exact ?? members[0];

  if (primary !== undefined) {
    return {
      id: primary.id,
      others: members.filter((member) => member.id !== primary.id).map((member) => member.id),
    };
  }

  /* 名指された場所には何も無かった。**それを含んでいるプロジェクトが在れば、そちらを開く**
     —— リポジトリの下の作業ディレクトリを打ったときに、そこを含むプロジェクトが観測できて
     いるなら、それが打った人の見たいものである。最も深い 1 つを採るのは、プロセスの帰属を
     決めるときと同じ理由による。 */
  const ancestors = located
    .filter((candidate) => containsPath(candidate.canonicalPath, input.root))
    .sort(
      (a, b) => pathDepth(b.canonicalPath) - pathDepth(a.canonicalPath) || a.id.localeCompare(b.id),
    );

  return { id: ancestors[0]?.id ?? null, others: [] };
}
