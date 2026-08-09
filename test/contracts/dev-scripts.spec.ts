import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/* 手元の道具立ての約束。**層に紐づかないのでここに置いてある。**

   繋いだ手順が中で別の手順を呼ぶとき、`npm run` と直に書くと、bun しか入れていない
   手元ではそこだけ止まる。止まり方が「型が通らない」でも「検めが落ちた」でもなく
   「npm という名前が無い」なので、出た字から原因に辿り着けない。

   走らせ役は `$npm_execpath` で引き継ぐ。npm も bun も、自分を指す名前をここへ入れる。 */

const ROOT = path.resolve(import.meta.dirname, '..', '..');

const scripts: Record<string, string> = JSON.parse(
  fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'),
).scripts;

describe('手元の道具は、走らせ役を選ばない', () => {
  it.each(Object.entries(scripts))('%s は npm を名指ししない', (_name, body) => {
    expect(body, '中から呼ぶ手順は $npm_execpath 経由にする').not.toContain('npm run');
    expect(body, 'npx は npm が連れてくる。bun だけの手元には無い').not.toContain('npx ');
  });

  it('繋いだ手順は、走らせ役を引き継いで呼ぶ', () => {
    expect(scripts.build).toContain('$npm_execpath run');
    expect(scripts.check).toContain('$npm_execpath run');
  });

  /* 手順から呼ぶ道具も同じ。注釈の中の言及は数えない — 「npx で入った先」のような
     説明まで禁じると、なぜそう書いてあるのかを書けなくなる。 */
  it('手順から呼ぶ道具も npx を通さない', () => {
    const dir = path.join(ROOT, 'scripts');
    for (const name of fs.readdirSync(dir)) {
      const source = fs.readFileSync(path.join(dir, name), 'utf8');
      const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
      expect(code, `${name} が npx を呼んでいる`).not.toMatch(/['"`]npx['"`]/);
    }
  });
});
