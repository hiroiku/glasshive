import { execFile } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { promisify } from 'node:util';

/* 型を検める。

   **層ごとに 1 回ずつ走らせる。** 層の tsconfig には、その層が見てよい先への道しか
   引いていない。だから見てはいけない層を import すると「その名前は無い」で落ちる —
   依存の決まりが、注意書きではなく組み立ての条件になる。

   最後に全体を 1 回。層ごとの検めは自分の中しか見ないので、層を跨いだ型の食い違いは
   ここでしか捕まらない。

   先に束ねた一枚を組み立てるのは、層ごとの検めが**隣の層の型の書き出しを読む**ためである。
   組み立てずに走らせると、書き出しが古いまま照らされ、直したはずの食い違いが残って見える —
   あるいは、足したばかりのファイルが「まだ組み立てられていない」と言われて止まる。 */

const run = promisify(execFile);
const ROOT = path.resolve(import.meta.dirname, '..');

/* 型を検める道具は、いま走っている実行系にそのまま渡す。**`npx` を呼ばない** —
   npx は npm が連れてくるもので、bun だけを入れている手元には無い。
   入れた版そのものを指すので、機械にどの版が入っているかにも左右されない。 */
const tsc = path.join(ROOT, 'node_modules', 'typescript', 'bin', 'tsc');

try {
  await run(process.execPath, [tsc, '-b', 'tsconfig.layers.json'], { cwd: ROOT });
} catch (error) {
  console.error(`${error.stdout ?? ''}${error.stderr ?? ''}`.trim());
  console.error('\n層の組み立てが通らない');
  process.exit(1);
}

const layers = fs
  .readdirSync(path.join(ROOT, 'src'), { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => path.join('src', entry.name, 'tsconfig.json'))
  .filter((file) => fs.existsSync(path.join(ROOT, file)));

const projects = [...layers, 'tsconfig.json'];

const results = await Promise.all(
  projects.map(async (project) => {
    try {
      await run(process.execPath, [tsc, '-p', project, '--noEmit'], { cwd: ROOT });
      return { project, output: null };
    } catch (error) {
      return {
        project,
        output: `${error.stdout ?? ''}${error.stderr ?? ''}`.trim(),
      };
    }
  }),
);

const failed = results.filter((result) => result.output !== null);
for (const result of failed) {
  console.error(`\n── ${result.project} ──\n${result.output}`);
}

if (failed.length > 0) {
  console.error(`\n型が通らない構成が ${failed.length} 件`);
  process.exit(1);
}
console.log(`型は ${projects.length} 構成すべて通っている`);
