import path from 'node:path';
import type { AppError } from '~/app-kernel/error.ts';
import { isSafeAbsolutePath } from '~/app-kernel/path.ts';
import { err, ok, type Result } from '~/app-kernel/result.ts';
import { ProjectNotObservedError } from '~/application/errors/sessions/not-observed.error.ts';
import type { ProjectTree } from '~/domain/entities/sessions/observed-project.entity.ts';
import type { ReadableScope } from '~/domain/entities/workspace/readable-scope.entity.ts';

/* 読んでよいパスを、観測した木 1 枚から作る。

   **既定で断る。** 読んでよいのは、いまの一覧が実際に観測したものだけである。
   コントローラーはパスを名指しできず、自分の一覧から引ける id しか渡せない。
   パスを渡り歩くという攻撃面そのものが、ポートの形の時点で消えている。

   ここに読み書きは無い。木が入れ替われば範囲も入れ替わる、それだけの導出である。 */

/* 正規化すれば文字列が変わるものは、どちら側でも受け取らない。

   **こちらで正規化してはいけない。** `/x/link/../a/s1.jsonl` は文字列の上では `/x/a/s1.jsonl`
   に正規化できるが、シンボリックリンクを辿る OS が開くのは別のファイルである。正規化して
   覚えれば観測していない中身が範囲に入り、正規化して見比べれば観測した `transcript` の
   パスを借りて別の中身が読める。同じ穴なので、覚えるときも照らすときも同じ決まりで断る。 */
const isFolded = (value: string): boolean => path.normalize(value) === value;

export function fromTree(tree: ProjectTree): ReadableScope {
  const projectsById = new Map<string, string>();
  const transcriptFiles = new Set<string>();

  const addTranscript = (file: string): void => {
    // パスとして使えない文字列は、この先どこへも渡さない
    if (!isSafeAbsolutePath(file) || !isFolded(file)) return;
    transcriptFiles.add(file);
  };

  for (const project of tree.projects) {
    /* パスの分からないプロジェクトは引けないままにする。引けない振りではなく、本当に引けない。
       名前でしか組めなかったプロジェクトに、当てずっぽうのパスを与えない。

       解決できなかったプロジェクトには、`transcript` に書かれていた作業ディレクトリが
       そのまま入る。書かれた文字列は観測ではないので、`..` を含むものはここで落とす。
       正規化して覚えると、書いた側が選んだパスが「観測できたプロジェクトのパス」として
       引けてしまう。 */
    const location = project.canonicalPath;
    if (location !== null && isSafeAbsolutePath(location) && isFolded(location)) {
      projectsById.set(project.id, location);
    }

    /* `transcript` は、パスが引けないプロジェクトのものも入れる。
       作業ディレクトリが分からないことと、会話が読めることは別の話である。 */
    for (const session of project.sessions) {
      addTranscript(session.file);
      for (const subagent of session.subagents) addTranscript(subagent.file);
    }
  }

  return { projectsById, transcriptFiles };
}

/* id は名前ひとつぶんである。区切りを含むものはここで断る。

   一覧のキーは `~/.claude/projects` に在るディレクトリ名なので、区切りも `..` も混じり得ない。
   その性質に頼らず形で断っておくのは、**絶対パスを受け取る経路を二度と生やさない**ためである。 */
function isPlainId(id: string): boolean {
  if (id === '' || id === '.' || id === '..') return false;
  if (id.includes('\0')) return false;
  return !id.includes('/') && !id.includes(path.sep);
}

/* 知らない id は断る。形が違うのも、一覧に無いのも、同じ断り方をする。
   分けると、断り方の違いだけで `~/.claude/projects` に何が在るかが分かってしまう。 */
export function resolveProject(scope: ReadableScope, id: string): Result<string, AppError> {
  if (!isPlainId(id)) return err(new ProjectNotObservedError('Not an observed project'));
  const location = scope.projectsById.get(id);
  if (location === undefined) {
    return err(new ProjectNotObservedError('Not an observed project'));
  }
  return ok(location);
}

/* 観測した `transcript` の集合に居るか。渡すのは解決済みのパスである。

   **前方一致では見ない。** 前方一致だと、観測した `transcript` の隣に置かれただけの
   別のファイルが「中にある」ことになる。集合に含まれるかどうかで見れば、実際に観測できた
   `transcript` そのものしか通らない。 */
export function allowsTranscript(scope: ReadableScope, realPath: string): boolean {
  // 正規化すれば文字列が変わるものは、集合を引くまでもなく断る
  if (!isSafeAbsolutePath(realPath) || !isFolded(realPath)) return false;
  return scope.transcriptFiles.has(realPath);
}
