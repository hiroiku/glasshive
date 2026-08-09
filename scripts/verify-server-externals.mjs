#!/usr/bin/env node

// 配りものが、外の名前に頼っていないことを確かめる。
//
// この道具は dependencies を持たない。npx で入った先には node_modules が無いので、
// 組み立てた成果物が外の名前を 1 つでも import していたら、その日から起動しなくなる。
// しかも壊れ方は「入れた人の手元で MODULE_NOT_FOUND」なので、こちらでは再現しない。
//
// だから「dependencies と突き合わせる」のではなく、**Node の組み込み以外が出たら落とす**。

import fs from 'node:fs';
import { builtinModules } from 'node:module';
import path from 'node:path';
import { init, parse } from 'es-module-lexer';

const SERVER_DIR = path.resolve('dist/server');
const LAUNCHER_DIR = path.resolve('dist/launcher');

const builtin = new Set([...builtinModules, ...builtinModules.map((m) => `node:${m}`)]);

/* 名指しされた先は、**字面ではなく構文で**拾う。
   束ねたライブラリは自分の使い方を注釈に書いており、その中の `require('markdown-it')` は
   ただの文章である。字面で数えると、束ねてあるのに「外に頼っている」と言い続ける。
   逆に緩めれば、本当に外へ出た名前を見落とす — どちらの側にも倒せない場所なので、
   Vite 自身が使う読み取り役に読ませる。 */
function specifiersOf(code, where) {
  const [imports] = parse(code, where);
  // 名前が実行時に組み立てられる import() は n が空になる。静的には読めない
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
      // 相対と絶対は自分の中。組み込みは入っている前提でよい
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
  console.error('配りものが外の名前に頼っています(npx で入れた先では見つかりません):\n');
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

console.log('配りものは Node の組み込みだけで完結しています');
