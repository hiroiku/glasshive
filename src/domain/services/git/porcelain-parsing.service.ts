import type { BranchRef } from '~/domain/value-objects/git/branch-ref.value-object.ts';
import {
  type CommitSummary,
  type MainlineCommit,
  shortSha,
} from '~/domain/value-objects/git/commit-summary.value-object.ts';
import type { DiffFileStat } from '~/domain/value-objects/git/diff-stat.value-object.ts';
import type { Worktree } from '~/domain/value-objects/git/worktree.value-object.ts';

/* `git` の出力を、値に読み替える。ここは `git` を起動しないし、ファイルにも触らない。

   欄の区切りに `\0` を使うのは、コミットの題に空白も改行も入るからである。空白で切ると、
   題の 1 語目までしか読めない。**求める欄をこちらで指定しているので、パースとフォーマットは
   必ず対で直す。** そのためにフォーマット文字列もここに置いてある。

   欄が足りない行は、`git` が出力を途中で切ったか、フォーマットを直し忘れたときにだけ起こる。
   その 1 行を投げて観測ごと落とすより、空文字列として通すほうが害が小さい。 */

/** ブランチのメタ情報。名 / 短い sha / 最後のコミットの時刻 / 題 / いま出ているか */
export const BRANCH_REF_FORMAT =
  '%(refname:short)%00%(objectname:short)%00%(committerdate:iso-strict)%00%(subject)%00%(HEAD)';

/** ブランチの名だけ */
export const BRANCH_NAME_FORMAT = '%(refname:short)';

/** 本流の 1 コミット。sha / 親ぜんぶ / 時刻 / 題 */
export const MAINLINE_FORMAT = '%H%x00%P%x00%cI%x00%s';

/** コミットのメタ情報。短い sha / 時刻 / 書いた人 / 題 */
export const COMMIT_LOG_FORMAT = '%h%x00%cI%x00%an%x00%s';

const WORKTREE_PREFIX = 'worktree ';
const HEAD_PREFIX = 'HEAD ';
const BRANCH_PREFIX = 'branch ';
const DETACHED_LINE = 'detached';
const HEADS_PREFIX = /^refs\/heads\//;

/** 中身のある行だけを、欄に切って返す */
function* fields(text: string): Generator<readonly (string | undefined)[]> {
  for (const line of text.split('\n')) {
    if (line === '') continue;
    yield line.split('\0');
  }
}

/* `worktree list --porcelain` を読む。

   1 つの `worktree` が複数行で書かれ、`worktree` の行が次の 1 つの始まりになる。
   だからその行が来るまでは、直前の `worktree` のものとして読む。 */
export function parseWorktreeList(text: string): Worktree[] {
  const worktrees: Worktree[] = [];
  let current: {
    path: string;
    branch: string | null;
    sha: string | null;
    detached: boolean;
  } | null = null;
  for (const line of text.split('\n')) {
    if (line.startsWith(WORKTREE_PREFIX)) {
      current = {
        path: line.slice(WORKTREE_PREFIX.length),
        branch: null,
        sha: null,
        detached: false,
      };
      worktrees.push(current);
      continue;
    }
    if (current === null) continue;
    if (line.startsWith(HEAD_PREFIX)) current.sha = shortSha(line.slice(HEAD_PREFIX.length));
    else if (line.startsWith(BRANCH_PREFIX)) {
      current.branch = line.slice(BRANCH_PREFIX.length).replace(HEADS_PREFIX, '');
    } else if (line === DETACHED_LINE) current.detached = true;
  }
  return worktrees;
}

/** `for-each-ref` の出力をブランチのメタ情報に読み替える */
export function parseBranchRefs(text: string): BranchRef[] {
  const branches: BranchRef[] = [];
  for (const [name, sha, date, subject, head] of fields(text)) {
    branches.push({
      name: name ?? '',
      sha: sha ?? '',
      date: date ?? '',
      subject: subject ?? '',
      // git は出ているブランチにだけ `*` を置く
      head: head === '*',
    });
  }
  return branches;
}

/** ブランチの名だけを並べた出力を読む。`--no-merged` の出力がこれ */
export function parseBranchNames(text: string): Set<string> {
  const names = new Set<string>();
  for (const line of text.split('\n')) {
    const name = line.trim();
    if (name !== '') names.add(name);
  }
  return names;
}

/** 本流のコミットを読む。親が 2 つ以上あれば合流のコミットである */
export function parseMainline(text: string): MainlineCommit[] {
  const mainline: MainlineCommit[] = [];
  for (const [sha, parents, date, subject] of fields(text)) {
    mainline.push({
      sha: shortSha(sha ?? ''),
      merge: (parents ?? '').split(' ').filter(Boolean).length > 1,
      date: date ?? '',
      subject: subject ?? '',
    });
  }
  return mainline;
}

/** コミットのメタ情報を読む */
export function parseCommitLog(text: string): CommitSummary[] {
  const commits: CommitSummary[] = [];
  for (const [sha, date, author, subject] of fields(text)) {
    commits.push({
      sha: sha ?? '',
      date: date ?? '',
      author: author ?? '',
      subject: subject ?? '',
    });
  }
  return commits;
}

/** `diff --name-only` の出力。変更したファイルのパスが 1 行ずつ並ぶ */
export function parseChangedPaths(text: string): string[] {
  return text.split('\n').filter((line) => line !== '');
}

/* `diff --numstat` の出力を読む。増 / 減 / パス がタブ区切りで並ぶ。

   増減が `-` の行は中身がテキストではないもの(画像など)で、`git` は数を出さない。
   数値として読めない欄は 0 として数え、行そのものは残す — 触った事実は消さない。 */
export function parseNumstat(text: string): DiffFileStat[] {
  const rows: DiffFileStat[] = [];
  for (const line of text.split('\n')) {
    if (line.trim() === '') continue;
    const [add, del, changedPath] = line.split('\t');
    rows.push({
      path: changedPath ?? '',
      add: Number(add) || 0,
      del: Number(del) || 0,
    });
  }
  return rows;
}
