import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/* 開発用スクリプトの約束。**層に紐づかないのでここに置いてある。**

   npm scripts が中から別のスクリプトを呼ぶとき、`npm run` と直に書くと、bun しか入れて
   いないローカルではそこだけ止まる。止まり方が「型が通らない」でも「検証が落ちた」でもなく
   「npm という名前が無い」なので、出力から原因に辿り着けない。

   パッケージマネージャーは `$npm_execpath` で引き継ぐ。npm も bun も、自分を指すパスを
   ここへ入れる。 */

const ROOT = path.resolve(import.meta.dirname, '..', '..');

const scripts: Record<string, string> = JSON.parse(
  fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'),
).scripts;

describe('開発用スクリプトは、パッケージマネージャーを選ばない', () => {
  it.each(Object.entries(scripts))('%s は npm を名指ししない', (_name, body) => {
    expect(body, '中から呼ぶスクリプトは $npm_execpath 経由にする').not.toContain('npm run');
    expect(body, 'npx は npm が連れてくる。bun だけのローカルには無い').not.toContain('npx ');
  });

  it('スクリプトから呼ぶスクリプトも、パッケージマネージャーを引き継ぐ', () => {
    expect(scripts.build).toContain('$npm_execpath run');
    expect(scripts.check).toContain('$npm_execpath run');
  });

  /* スクリプトから呼ぶコマンドも同じ。コメントの中の言及は数えない — 「npx で入った先」のような
     説明まで禁じると、なぜそう書いてあるのかを書けなくなる。 */
  it('スクリプトから呼ぶコマンドも npx を通さない', () => {
    const dir = path.join(ROOT, 'scripts');
    for (const name of fs.readdirSync(dir)) {
      const source = fs.readFileSync(path.join(dir, name), 'utf8');
      const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
      expect(code, `${name} が npx を呼んでいる`).not.toMatch(/['"`]npx['"`]/);
    }
  });
});
