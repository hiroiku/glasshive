// バンドルが取り込んだパッケージのライセンス表示を集めて `THIRD-PARTY-NOTICES.md` に
// 書き出す Vite プラグイン。
//
// glasshive は `dependencies` を持たず、`ssr.resolve.noExternal` で依存をビルド成果物の中へ
// 取り込む。取り込んだ時点でそれは再配布であり、MIT も BSD-3-Clause も「著作権表示と許諾条項を
// 一緒に配ること」を条件にしている。パッケージが運ぶのは glasshive 自身の `LICENSE` だけなので、
// 取り込んだぶんの表示はこちらで用意しなければならない。
//
// **どのパッケージが入ったかは、依存の一覧ではなくバンドルそのものから読む。**
// `devDependencies` を並べても、実際に取り込まれるのはその一部で、代わりに推移的な依存が入る。
// `generateBundle` が受け取るチャンクの `modules` は Rollup が実際に束ねたモジュールの id
// そのものなので、ここだけが本当のことを言っている。
//
// 他のスクリプトと違って TypeScript なのは、これが node から直に走るのではなく
// `vite.config.ts` から `import` されるからである。`.mjs` のままだと型が付かない。

import fs from 'node:fs';
import path from 'node:path';
import type { Plugin } from 'vite';

const ROOT = path.resolve(import.meta.dirname, '..');
const OUTPUT_FILE = 'THIRD-PARTY-NOTICES.md';

const NODE_MODULES = `${path.sep}node_modules${path.sep}`;

/* ライセンス本文が置かれるファイル名。大文字小文字も拡張子も揃っていないので、
   `LICENSE` / `LICENCE` / `COPYING` / `NOTICE` で始まるものを拾う。`LICENSE-MIT` と
   `LICENSE-APACHE` のように 2 つ置くパッケージがあるため、1 つ見つけても打ち切らない。 */
const LICENSE_FILE = /^(?:licen[cs]e|copying|notice)(?:[-._].*)?$/i;

type PackageManifest = {
  readonly name?: unknown;
  readonly version?: unknown;
  readonly license?: unknown;
  readonly licenses?: unknown;
};

type BundledPackage = {
  readonly name: string;
  readonly version: string;
  readonly spdx: string | undefined;
  readonly texts: readonly { readonly name: string; readonly text: string }[];
};

/* クライアントと ssr は別々の Rollup のビルドとして走り、`generateBundle` もそれぞれで
   呼ばれる。どちらか一方だけを見ると、その環境にしか入らないパッケージの表示が落ちる。
   モジュールの側に持たせて、両方のぶんを 1 つに足し合わせる。 */
const collected = new Map<string, BundledPackage>();

function readJson(file: string): PackageManifest | undefined {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8')) as PackageManifest;
  } catch {
    return undefined;
  }
}

/* モジュールの id から、それを含むパッケージのディレクトリまで遡る。

   一番近い `package.json` で止めてはいけない。`dist/package.json` に `{"type": "module"}` だけを
   置くパッケージがあり、そこで止めると名前もバージョンも取れない。両方が揃うまで遡り、
   その id を含む `node_modules` より上へは出ない。 */
function ownerOf(
  filePath: string,
): { dir: string; name: string; version: string; manifest: PackageManifest } | undefined {
  const at = filePath.lastIndexOf(NODE_MODULES);
  if (at === -1) return undefined;

  const root = filePath.slice(0, at + NODE_MODULES.length);
  let dir = path.dirname(filePath);
  while (dir.startsWith(root)) {
    const manifest = readJson(path.join(dir, 'package.json'));
    if (typeof manifest?.name === 'string' && typeof manifest.version === 'string') {
      return { dir, name: manifest.name, version: manifest.version, manifest };
    }
    dir = path.dirname(dir);
  }
  return undefined;
}

/* `license` フィールドには 3 通りの書き方が残っている。SPDX の文字列が今の形で、
   `{ type, url }` と `licenses: [...]` は古いパッケージがまだ使っている。 */
function spdxOf(manifest: PackageManifest): string | undefined {
  const { license, licenses } = manifest;
  if (typeof license === 'string') return license;
  if (typeof license === 'object' && license !== null) {
    const { type } = license as { type?: unknown };
    if (typeof type === 'string') return type;
  }
  if (Array.isArray(licenses)) {
    const types = licenses
      .map((one: unknown) =>
        typeof one === 'string' ? one : ((one as { type?: unknown })?.type ?? undefined),
      )
      .filter((type: unknown): type is string => typeof type === 'string');
    if (types.length > 0) return types.join(' OR ');
  }
  return undefined;
}

function licenseTextsIn(dir: string): { name: string; text: string }[] {
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  return entries
    .filter((entry) => entry.isFile() && LICENSE_FILE.test(entry.name))
    .map((entry) => entry.name)
    .sort()
    .map((name) => ({ name, text: fs.readFileSync(path.join(dir, name), 'utf8').trim() }))
    .filter((one) => one.text.length > 0);
}

function collect(source: string): void {
  // 仮想モジュールはディスク上のファイルではないので、遡ってもパッケージには行き着かない
  if (source.startsWith('\0')) return;

  // `?v=` や `?used` のような問い合わせは Vite が付けたもので、パスの一部ではない。
  // アセットの出どころはルートからの相対で来ることがあるので、絶対パスに揃える
  const filePath = path.resolve(ROOT, source.split('?')[0] ?? source);
  if (!filePath.includes(NODE_MODULES)) return;

  const owner = ownerOf(filePath);
  if (owner === undefined) return;

  const key = `${owner.name}@${owner.version}`;
  if (collected.has(key)) return;

  collected.set(key, {
    name: owner.name,
    version: owner.version,
    spdx: spdxOf(owner.manifest),
    texts: licenseTextsIn(owner.dir),
  });
}

/* 並び順は文字コードで決める。`localeCompare` は機械の設定で結果が変わるので、
   同じ入力から同じファイルが出ることを保証できない。 */
function compare(a: string, b: string): number {
  if (a < b) return -1;
  return a > b ? 1 : 0;
}

/* 本文をそのまま地の文に置くと、BSD の箇条書きや `#` から始まる行を Markdown が別のものとして
   描く。囲って原文のまま見せる。囲いはバッククォートを本文より 1 つ多く並べる —
   本文にコードの例が入っていて 3 つでは閉じてしまうパッケージがある。 */
function fenced(text: string): string {
  const runs = [...text.matchAll(/`+/g)].map((run) => run[0]?.length ?? 0);
  const fence = '`'.repeat(Math.max(3, Math.max(0, ...runs) + 1));
  return `${fence}text\n${text}\n${fence}`;
}

function sectionFor(pkg: BundledPackage): string[] {
  const lines = [`## ${pkg.name}@${pkg.version}`, ''];

  lines.push(
    pkg.spdx === undefined ? 'License: not declared by the package.' : `License: \`${pkg.spdx}\``,
    '',
  );

  // ライセンス本文が入っていないパッケージも必ず並べる。落とせば「取り込んでいない」に見え、
  // 本文を書き足せば嘘になる。無かったことをそのまま書く
  if (pkg.texts.length === 0) {
    lines.push('No license text was found in the package.', '');
    return lines;
  }

  for (const text of pkg.texts) lines.push(`### ${text.name}`, '', fenced(text.text), '');
  return lines;
}

function render(): string {
  const packages = [...collected.values()].sort((a, b) =>
    a.name === b.name ? compare(a.version, b.version) : compare(a.name, b.name),
  );

  const lines = [
    '# Third-Party Notices',
    '',
    'glasshive ships as a single self-contained package with no runtime dependencies: the build',
    'inlines its dependencies into `dist/client` and `dist/server`. The packages listed below are',
    'part of that output, and their copyright and permission notices are reproduced here as their',
    'licenses require. Each package stays under its own license; glasshive itself is covered by',
    '`LICENSE`.',
    '',
    'Generated from the bundled module graph by `scripts/generate-third-party-notices.ts`.',
    'Do not edit by hand.',
    '',
    `Bundled packages: ${packages.length}`,
    '',
  ];

  for (const pkg of packages) lines.push(...sectionFor(pkg));

  return `${lines.join('\n').trimEnd()}\n`;
}

export function thirdPartyNotices(): Plugin {
  return {
    name: 'glasshive:third-party-notices',

    // 開発中はバンドルしない。取り込んだものが無いのだから、集めるものも無い
    apply: 'build',

    generateBundle(_options, bundle) {
      for (const output of Object.values(bundle)) {
        if (output.type === 'chunk') {
          for (const moduleId of Object.keys(output.modules)) collect(moduleId);
          continue;
        }
        /* アセットもモジュールと同じだけ配布に乗る。フォントは CSS の `@import` から入るので
           モジュールの一覧には出てこないが、`.woff2` が `dist/client` に置かれる以上
           再配布であり、OFL は著作権表示を一緒に配ることを求めている。 */
        for (const source of output.originalFileNames) collect(source);
      }
    },

    /* 環境ごとに呼ばれるので、そのたびにそれまでの全部で書き直す。
       最後の環境が終わった時点で、両方のぶんが入ったファイルが残る。 */
    writeBundle() {
      fs.writeFileSync(path.join(ROOT, OUTPUT_FILE), render());
    },
  };
}
