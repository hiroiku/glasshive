import path from 'node:path';
import type { AppError } from '~/app-kernel/error.ts';
import { isSafeAbsolutePath } from '~/app-kernel/path.ts';
import { err, ok, type Result } from '~/app-kernel/result.ts';
import { ProjectNotObservedError } from '~/application/errors/sessions/not-observed.error.ts';
import type { ProjectTree } from '~/domain/entities/sessions/observed-project.entity.ts';
import type { ReadableScope } from '~/domain/entities/workspace/readable-scope.entity.ts';

/* 読んでよい場所を、観測した木 1 枚から作る。

   **既定で断る。** 読んでよいのは、いまの一覧が実際に観測したものだけである。
   窓は場所を名指しできず、自分の一覧から引ける id しか渡せない。
   場所を渡り歩くという攻め口そのものが、口の形の時点で消えている。

   ここに読み書きは無い。木が入れ替われば範囲も入れ替わる、それだけの導出である。 */

/* 畳めば字が変わるものは、どちら側でも受け取らない。

   **こちらで畳んではいけない。** `/x/繋ぎ/../a/s1.jsonl` は字の上では `/x/a/s1.jsonl` に
   畳めるが、繋ぎを辿る OS が開くのは別の場所である。畳んで覚えれば観測していない中身が
   範囲に入り、畳んで見比べれば観測した正本の字を借りて別の中身が読める。同じ穴なので、
   覚えるときも照らすときも同じ決まりで断る。 */
const isFolded = (value: string): boolean => path.normalize(value) === value;

export function fromTree(tree: ProjectTree): ReadableScope {
  const projectsById = new Map<string, string>();
  const transcriptFiles = new Set<string>();

  const addTranscript = (file: string): void => {
    // 場所として使えない字は、この先どこへも渡さない
    if (!isSafeAbsolutePath(file) || !isFolded(file)) return;
    transcriptFiles.add(file);
  };

  for (const project of tree.projects) {
    /* 場所の分からない巣は引けないままにする。引けない振りではなく、本当に引けない。
       名前でしか組めなかった巣に、当てずっぽうの場所を与えない。

       解決できなかった巣には、正本に書かれていた作業場所がそのまま入る。書かれた字は
       観測ではないので、遡る字を含むものはここで落とす。畳んで覚えると、書いた側が
       選んだ場所が「観測できた巣の場所」として引けてしまう。 */
    const location = project.canonicalPath;
    if (location !== null && isSafeAbsolutePath(location) && isFolded(location)) {
      projectsById.set(project.id, location);
    }

    /* 正本は、場所が引けない巣のものも入れる。
       作業場所が分からないことと、会話が読めることは別の話である。 */
    for (const session of project.sessions) {
      addTranscript(session.file);
      for (const subagent of session.subagents) addTranscript(subagent.file);
    }
  }

  return { projectsById, transcriptFiles };
}

/* id は名前ひとつぶんである。区切りを含むものはここで断る。

   一覧の鍵は正本の置き場に在る名前なので、区切りも `..` も混じり得ない。
   その性質に凭れず形で断っておくのは、**絶対パスを受け取る道を二度と生やさない**ためである。 */
function isPlainId(id: string): boolean {
  if (id === '' || id === '.' || id === '..') return false;
  if (id.includes('\0')) return false;
  return !id.includes('/') && !id.includes(path.sep);
}

/* 知らない id は断る。形が違うのも、一覧に無いのも、同じ断り方をする。
   分けると、断り方の違いだけで置き場に何が在るかが分かってしまう。 */
export function resolveProject(scope: ReadableScope, id: string): Result<string, AppError> {
  if (!isPlainId(id)) return err(new ProjectNotObservedError('観測していない巣を尋ねられた'));
  const location = scope.projectsById.get(id);
  if (location === undefined) {
    return err(new ProjectNotObservedError('観測していない巣を尋ねられた'));
  }
  return ok(location);
}

/* 観測した正本の集合に居るか。渡すのは解決済みの場所である。

   **前方一致では見ない。** 前方一致だと、観測した正本の隣に置かれただけの
   別のファイルが「中にある」ことになる。集合帰属で見れば、実際に観測できた
   正本そのものしか通らない。 */
export function allowsTranscript(scope: ReadableScope, realPath: string): boolean {
  // 畳めば字が変わるものは、集合を引くまでもなく断る
  if (!isSafeAbsolutePath(realPath) || !isFolded(realPath)) return false;
  return scope.transcriptFiles.has(realPath);
}
