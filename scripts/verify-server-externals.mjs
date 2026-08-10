#!/usr/bin/env node

// 配る前にビルド成果物を検証する。外部依存に頼っていないことと、
// 取り込んだパッケージのライセンス表示が在ることの 2 つ。

// ── 外部依存 ──
//
// パッケージが外部依存に頼っていないことを確かめる。
//
// glasshive は `dependencies` を持たない。`npx` で入れた先には `node_modules` が無いので、
// ビルド成果物が外部の名前を 1 つでも `import` していたら、その日から起動しなくなる。
// しかも壊れ方は「インストールした人の機械で `MODULE_NOT_FOUND`」なので、こちらでは再現しない。
//
// だから `dependencies` と突き合わせるのではなく、**Node の組み込みモジュール以外が出たら落とす**。

import fs from 'node:fs';
import { builtinModules } from 'node:module';
import path from 'node:path';
import { init, parse } from 'es-module-lexer';

const SERVER_DIR = path.resolve('dist/server');
const LAUNCHER_DIR = path.resolve('dist/launcher');
const NOTICES_FILE = path.resolve('THIRD-PARTY-NOTICES.md');

const builtin = new Set([...builtinModules, ...builtinModules.map((m) => `node:${m}`)]);

/* `import` の指定先は、**文字列の検索ではなく構文解析で**拾う。
   バンドルしたライブラリは自分の使い方をコメントに書いており、その中の `require('markdown-it')`
   はただの文章である。文字列の検索で数えると、バンドル済みなのに「外部に頼っている」と
   言い続ける。逆に緩めれば、本当に外部へ出た名前を見落とす。どちらにも倒せないので、
   Vite 自身が使うパーサー(`es-module-lexer`)に読ませる。 */
function specifiersOf(code, where) {
  const [imports] = parse(code, where);
  // 指定先が実行時に組み立てられる動的 `import()` は `n` が `undefined` になる。静的には読めない
  return imports.map((one) => one.n).filter((name) => name !== undefined);
}

function jsFilesUnder(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir, { withFileTypes: true, recursive: true })
    .filter((e) => e.isFile() && e.name.endsWith('.js'))
    .map((e) => path.join(e.parentPath ?? e.path, e.name));
}

const offenders = new Map();

await init;

for (const dir of [SERVER_DIR, LAUNCHER_DIR]) {
  for (const file of jsFilesUnder(dir)) {
    const shown = path.relative(process.cwd(), file);
    for (const spec of specifiersOf(fs.readFileSync(file, 'utf8'), shown)) {
      // 相対パスと絶対パスはビルド成果物の中。組み込みモジュールは在る前提でよい
      if (spec.startsWith('.') || spec.startsWith('/')) continue;
      if (builtin.has(spec)) continue;
      const where = offenders.get(spec) ?? new Set();
      where.add(shown);
      offenders.set(spec, where);
    }
  }
}

if (jsFilesUnder(SERVER_DIR).length === 0) {
  console.error('dist/server が空です。先に build を済ませてください');
  process.exit(1);
}

if (offenders.size > 0) {
  console.error('ビルド成果物が外の名前に頼っています(npx で入れた先では見つかりません):\n');
  for (const [spec, where] of offenders) {
    console.error(`  ${spec}`);
    for (const file of where) console.error(`    ← ${file}`);
  }
  console.error(
    '\nvite.config.ts の environments.ssr.resolve.noExternal で束ねるか、' +
      'その名前を使わない形にしてください。',
  );
  process.exit(1);
}

// ── ライセンス表示 ──
//
// 取り込んだパッケージのライセンス表示が書き出されていることを確かめる。
//
// 依存をバンドルに取り込むのは再配布であり、MIT も BSD-3-Clause も OFL も、著作権表示と
// 許諾条項を一緒に配ることを条件にしている。表示は `vite.config.ts` のプラグインが
// `THIRD-PARTY-NOTICES.md` へ書き出すもので、git には入れていない。
//
// **黙って止まりうる。** プラグインを外しても、フックの名前が変わっても、ビルドは緑のまま通り、
// 表示を持たないパッケージがそのまま出ていく。誰も気付かないので、ここで赤にする。

const notices = fs.existsSync(NOTICES_FILE) ? fs.readFileSync(NOTICES_FILE, 'utf8') : '';

// 中身の正しさまでは見ないが、パッケージの節が 1 つも無いファイルは書き出しに失敗している
const sections = notices.match(/^## \S+@\S+$/gm) ?? [];

if (sections.length === 0) {
  console.error(
    'THIRD-PARTY-NOTICES.md が無いか、パッケージの節を 1 つも持っていません。\n' +
      'vite.config.ts の thirdPartyNotices() が動いているか確かめてください。',
  );
  process.exit(1);
}

console.log('ビルド成果物は Node の組み込みだけで完結しています');
console.log(`取り込んだ ${sections.length} 個のパッケージのライセンス表示が在ります`);
