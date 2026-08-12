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

/* 課題のやり取りの縦線。**点は線の上に載るだけで、線を切ってはいけない。**

   項目の間隔は `padding` で取ってあるので、点が流れの中に入ると、そのぶん行が押し広がって
   間隔が種類ごとに変わる。ここで見えるのは宣言が在ることだけで、点が線の真上に来ているか
   —— `left` の値が正しいか —— は、描かれた画面でしか確かめられない。 */
describe('やり取りの点は、線を切らない', () => {
  const panel = fs.readFileSync(path.join(STYLES, 'panel.css'), 'utf8');

  /** 宣言の並びを、その 1 つ分だけ切り出す */
  const ruleOf = (selector: string): string => {
    const at = panel.indexOf(`${selector} {`);
    return at === -1 ? '' : panel.slice(at, panel.indexOf('}', at));
  };

  it('点は流れの外に置く', () => {
    expect(ruleOf('.disc-dot'), '流れの中に入れると、点のぶんだけ項目の間隔が広がる').toContain(
      'position: absolute',
    );
  });

  it('点を載せる項目が、点の基準になっている', () => {
    for (const selector of ['.cmt-h', '.disc-ev']) {
      expect(ruleOf(selector), `${selector} が基準でないと、点は panel の左上まで飛ぶ`).toContain(
        'position: relative',
      );
    }
  });
});

/* 状態の色は 1 か所で決める、という決まりを跨いで確かめる。

   `--st` を置いているのは `issues.css` の `.st-*` で、それを読むのは `panel.css` の
   `.disc-ico` である。**読む側だけを直しても、色は静かに消える** —— `var(--st)` が解けない
   `color` は無効な値として捨てられ、アイコンは行の文字色を継いだまま、壊れているようには
   見えない姿で出る。 */
describe('アイコンの色は、状態の色の表から採る', () => {
  const issues = fs.readFileSync(path.join(STYLES, 'issues.css'), 'utf8');
  const panel = fs.readFileSync(path.join(STYLES, 'panel.css'), 'utf8');

  /** `.disc-ico` に足してある状態のクラス */
  const tones = [...panel.matchAll(/\.disc-ico\.(st-[\w_]+)/g)].map((hit) => hit[1]);

  it('読む側と置く側が、同じ綴りを指している', () => {
    expect(tones.length, '`.disc-ico` に状態の色が 1 つも足されていない').toBeGreaterThan(0);

    for (const tone of tones) {
      expect(issues, `${tone} に --st を置く規則が無い`).toContain(`.${tone} {\n  --st:`);
    }
  });
});

/* 数えられていない件数の代わりに出す文字。

   `.ubtn.on .n` と詳細度が同点なので、**勝ち負けを決めるのは書いた順だけである。** 前へ
   動かすと、選ばれているボタンでだけ数と同じ色になる —— クラスは付いていて宣言も在るのに
   効かないので、DOM を見るテストからは何も見えない。

   綴りは画面の側から採る。ここに書き写すと、`UnitSwitch` が別のクラスを付けるようになった
   ときに、誰も使っていない規則をここだけが確かめ続けることになる。 */
describe('件数の代わりの文字は、選ばれているボタンでも色を譲らない', () => {
  const work = fs.readFileSync(path.join(STYLES, 'work.css'), 'utf8');
  const switchSource = fs.readFileSync(
    path.join(ROOT, 'src', 'frameworks', 'tanstack', 'ui', 'components', 'work', 'UnitSwitch.tsx'),
    'utf8',
  );

  /** 数の代わりに付けるクラス。画面が組み立てている綴りをそのまま採る */
  const marks = [...switchSource.matchAll(/'([a-z]+)' : '([a-z]+)'/g)].flatMap((hit) => [
    hit[1],
    hit[2],
  ]);

  it('画面が付けるクラスを、そのまま見張っている', () => {
    expect(marks, 'クラスを 1 つも拾えていないと、この後の照合は何も見ていない').toEqual([
      'counting',
      'unread',
    ]);
  });

  it.each(['counting', 'unread'])('%s の色は、選ばれている側の規則より後に書いてある', (mark) => {
    const selected = work.indexOf('.ubtn.on .n {');
    const at = work.indexOf(`.ubtn .n.${mark} {`);

    expect(at, `.ubtn .n.${mark} の規則が無い`).toBeGreaterThan(-1);
    expect(at, '前に書くと、選ばれているボタンでだけ効かない').toBeGreaterThan(selected);
  });
});
