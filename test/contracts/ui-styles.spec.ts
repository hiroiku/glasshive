import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/* 見た目の決まりの入口は `index.css` 1 本である。

   `styles/` に 1 枚足しても、`index.css` の `@import` に並べるまでブラウザーには何も届かない。
   **それでも型は通り、テストも緑のまま**なので、届いていないことに気付く手掛かりが画面にしか
   残らない。届かなかった規則は、その規則が言おうとしていた事実ごと画面から消える。

   辿るのは相対の `@import` だけである。パッケージの名指し(フォント)はバンドラーが解決するので、
   ディレクトリの中に無い行き先はここでは追わない。 */

const ROOT = path.resolve(import.meta.dirname, '..', '..');
const STYLES = path.join(ROOT, 'src', 'frameworks', 'tanstack', 'ui', 'styles');
const ENTRY = path.join(STYLES, 'index.css');
const APP_ENTRY = path.join(ROOT, 'src', 'frameworks', 'tanstack', 'routes', '__root.tsx');

/** `@import` の行き先を、書かれた綴りのまま拾う。`url()` を被せた書き方も同じ 1 つとして扱う */
function importsOf(css: string): string[] {
  const found: string[] = [];
  for (const match of css.matchAll(/@import\s+(?:url\(\s*)?["']([^"']+)["']/g)) {
    const target = match[1];
    if (target !== undefined) found.push(target);
  }
  return found;
}

/** 入口から `@import` を辿って届く CSS の絶対パス */
function reachableFrom(entry: string): Set<string> {
  const reached = new Set<string>();
  const pending = [entry];
  for (let file = pending.pop(); file !== undefined; file = pending.pop()) {
    if (reached.has(file)) continue;
    reached.add(file);
    for (const target of importsOf(fs.readFileSync(file, 'utf8'))) {
      const full = path.resolve(path.dirname(file), target);
      if (fs.existsSync(full)) pending.push(full);
    }
  }
  return reached;
}

const sheets = fs
  .readdirSync(STYLES)
  .filter((name) => name.endsWith('.css'))
  .map((name) => path.join(STYLES, name))
  .sort();

describe('見た目の決まりは 1 本の入口から辿れる', () => {
  const reached = reachableFrom(ENTRY);

  it.each(sheets.map((file) => [path.relative(ROOT, file), file]))(
    '%s は index.css から辿れる',
    (_name, file) => {
      expect(reached.has(file), '入口から辿れない CSS は、書いてもブラウザーに届かない').toBe(true);
    },
  );

  it('入口そのものが画面から読み込まれている', () => {
    expect(fs.readFileSync(APP_ENTRY, 'utf8')).toContain("import '../ui/styles/index.css'");
  });

  /* 拾い方が壊れて 1 つも拾えなくなっても、どの CSS も緑のままなので気付けない */
  it('相対の行き先を拾い、パッケージの名指しも同じ 1 つとして数える', () => {
    const css = [
      '@import "@fontsource-variable/noto-sans-jp/index.css";',
      '@import "./base.css";',
      '@import url("./chrome.css");',
    ].join('\n');

    expect(importsOf(css)).toEqual([
      '@fontsource-variable/noto-sans-jp/index.css',
      './base.css',
      './chrome.css',
    ]);
  });
});
