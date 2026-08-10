import fs from 'node:fs';
import path from 'node:path';

/* `tsconfig` の `paths` では防げない決まりを検証する。

   層をまたぐ `import` は、層ごとの `tsconfig` が `paths` を通していないのでビルドが落ちる。
   ここで検証するのはそれ以外 — 同じ層の中で守るべきこと、ディレクトリ名とファイル名の
   噛み合い、テストが `src` を写した構造から外れていないか。

   どれも気付かないまま崩れていくたぐいの決まりなので、レビューで見つける前提にせず、
   CI が毎回検証する。 */

const ROOT = path.resolve(import.meta.dirname, '..');
const SRC = path.join(ROOT, 'src');
const TEST = path.join(ROOT, 'test');

/** 層と、その層が直接 `import` してよい層。層ごとの `tsconfig` の `paths` と同じ表を、こちらでも持つ */
const LAYERS = {
  'app-kernel': [],
  domain: ['app-kernel'],
  application: ['app-kernel', 'domain'],
  interface: ['app-kernel', 'application'],
  infrastructure: ['app-kernel', 'application'],
  frameworks: ['app-kernel', 'interface', 'composition'],
  // `frameworks` は `import` しない — `frameworks` が `composition` を使う側なので、循環する
  composition: ['app-kernel', 'domain', 'application', 'interface', 'infrastructure'],
};

/** 種類ごとのディレクトリ名と、そこに置くファイル名の接尾辞 */
const KIND_SUFFIX = {
  entities: 'entity',
  'value-objects': 'value-object',
  services: 'service',
  errors: 'error',
  'use-cases': 'use-case',
  controllers: 'controller',
  presenters: 'presenter',
  repositories: 'repository',
  integrations: 'integration',
};

const problems = [];
const report = (file, message) => problems.push(`${path.relative(ROOT, file)}\n    ${message}`);

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (/\.tsx?$/.test(entry.name)) out.push(full);
  }
  return out;
}

/** `import` されている名前を全部拾う。`import type` だけの参照も同じ依存として数える */
function specifiersOf(text) {
  const found = [];
  for (const match of text.matchAll(/(?:from|import)\s*\(?\s*'([^']+)'/g)) found.push(match[1]);
  return found;
}

/* `import` の行き先を、層の名前に解決する。
   `~/` でも相対パスでも、最後は `src` からの位置で決まる。 */
function targetLayerOf(file, specifier) {
  if (specifier.startsWith('~/')) return specifier.slice(2).split('/')[0];
  if (!specifier.startsWith('.')) return null;
  const resolved = path.resolve(path.dirname(file), specifier);
  if (!resolved.startsWith(SRC + path.sep)) return null;
  return path.relative(SRC, resolved).split(path.sep)[0];
}

/* bounded context の名前。層ごとにディレクトリの深さが違う。

   種類ごとのディレクトリの直下に在るものは、どの bounded context にも属さない
   (bounded context をまたいで使う共通の型など)。そこはファイル名を bounded context の
   ディレクトリ名と読み違えないよう `null` を返す。 */
function contextOf(file) {
  const parts = path.relative(SRC, file).split(path.sep);
  const [layer, ...rest] = parts;
  const depth = layer === 'application' && rest[0] === 'ports' ? 3 : 2;
  // 末尾の 1 つはファイル名。それより浅ければ bounded context のディレクトリを持っていない
  return rest.length > depth ? (rest[depth - 1] ?? null) : null;
}

const boundedContexts = (() => {
  const source = fs.readFileSync(path.join(SRC, 'app-kernel', 'bounded-context.ts'), 'utf8');
  const list = /BOUNDED_CONTEXTS\s*=\s*\[([^\]]+)\]/.exec(source);
  if (list === null) throw new Error('BOUNDED_CONTEXTS の宣言を読めなかった');
  return new Set([...list[1].matchAll(/'([^']+)'/g)].map((m) => m[1]));
})();

// ── src ────────────────────────────────────────────────────────────────────

for (const file of walk(SRC)) {
  const parts = path.relative(SRC, file).split(path.sep);
  const layer = parts[0];
  if (file.endsWith('routeTree.gen.ts') || parts.at(-1) === 'tsconfig.json') continue;

  if (!(layer in LAYERS)) {
    report(file, `層の名前ではない: ${layer}`);
    continue;
  }

  const isSpec = /\.spec\.tsx?$/.test(file);
  if (isSpec) report(file, 'テストは /src に置かない。`src` を写した /test へ移すこと');

  const text = fs.readFileSync(file, 'utf8');
  const allowed = LAYERS[layer];

  for (const specifier of specifiersOf(text)) {
    const target = targetLayerOf(file, specifier);
    if (target === null || target === layer) continue;
    if (!allowed.includes(target)) {
      report(file, `${layer} は ${target} を見ない: ${specifier}`);
    }
  }

  /* `domain` は bounded context をまたがない。またぐ調整は `application` の仕事である。
     同じ層の中の `import` なので `tsconfig` の `paths` では止まらない — ここでしか止められない。 */
  if (layer === 'domain') {
    const own = contextOf(file);
    for (const specifier of specifiersOf(text)) {
      if (targetLayerOf(file, specifier) !== 'domain') continue;
      const resolved = specifier.startsWith('~/')
        ? path.join(SRC, specifier.slice(2))
        : path.resolve(path.dirname(file), specifier);
      const other = contextOf(resolved);
      if (own !== null && other !== null && own !== other) {
        report(file, `domain が bounded context をまたいでいる: ${own} → ${other}`);
      }
    }
  }

  // ディレクトリ名と、ファイル名の接尾辞が噛み合っているか
  const kind = layer === 'application' && parts[1] === 'ports' ? parts[2] : parts[1];
  const suffix = KIND_SUFFIX[kind];
  const name = parts.at(-1);
  if (!isSpec && suffix !== undefined && !name.endsWith(`.${suffix}.ts`)) {
    report(file, `${kind}/ に置くなら名前は .${suffix}.ts で終わること`);
  }

  // bounded context は 1 箇所で宣言する。ディレクトリ名はその集合に属する
  const context = contextOf(file);
  const declaresContext = suffix !== undefined || (layer === 'application' && parts[1] === 'ports');
  if (declaresContext && context !== null && !boundedContexts.has(context)) {
    report(file, `bounded context の一覧に無い名前: ${context}`);
  }
}

// ── test ───────────────────────────────────────────────────────────────────

for (const file of walk(TEST)) {
  const parts = path.relative(TEST, file).split(path.sep);
  const layer = parts[0];
  // 層に紐づかないテストは `src` を写した構造の外に置く。そちらは層の決まりを負わない
  if (!(layer in LAYERS)) continue;

  const text = fs.readFileSync(file, 'utf8');
  for (const specifier of specifiersOf(text)) {
    if (!specifier.startsWith('~/')) continue;
    const target = specifier.slice(2).split('/')[0];
    if (target !== layer && target !== 'app-kernel') {
      report(file, `test/${layer}/ が見てよいのは src/${layer} と app-kernel だけ: ${specifier}`);
    }
  }
}

if (problems.length > 0) {
  console.error(`\n層の決まりに合わないところが ${problems.length} 件:\n`);
  for (const problem of problems) console.error(`  ${problem}\n`);
  process.exit(1);
}
console.log('層の決まりはすべて満たされている');
