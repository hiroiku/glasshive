# glasshive

働いている AI エージェントとその子を、手を出さずガラス越しに観るための、手元だけのダッシュボード。

`~/.claude/projects/**/*.jsonl`(正本)と `.beads/issues.jsonl`(台帳)と `git` を**読むだけ**で、
セッションと子の並び・状態・稼働の帯・会話・課題・枝の様子を一つの画面に集める。

```sh
npx glasshive
```

127.0.0.1 だけで待ち受け(既定 4483 — 盤で `HIVE`)、ブラウザーが開く。

## 芯

- **観測元へは何も書かない。** 正本にも台帳にも記録にも触らない。書くのは自分の覚え書き 1 つだけで、
  それも観測している場所の中でないことを確かめてから置く([ADR 0001](docs/adr/0001-read-only.md))
- **「空だった」と「見に行けなかった」を分ける。** 読めなかった欄は `null` のまま運び、
  読めなかったという事実を添えて出す。静かな画面が「何も起きていない」なのか
  「こちらが見られていない」なのかを、観る人が取り違えないため
- **観る範囲は観る人が決める。** どこから起動しても、エージェントが動いた巣はすべて一覧に出る。
  タブに並べるものは一覧から選ぶ([ADR 0003](docs/adr/0003-viewer-chooses-scope.md))
- **手元だけで完結する。** 配りものは Node の組み込み以外を 1 つも参照しない。
  外へ問い合わせない、外から呼ばれない。字(Noto Sans JP / Noto Sans Mono)も同梱してあるので、
  外の書体置き場へも取りに行かず、どの機械でも同じ字面で出る

## 使い方

```sh
npx glasshive                      # 既定の 4483 で開く
npx glasshive --port 11999         # 番号を変える
npx glasshive --no-open            # ブラウザーを開かない
npx glasshive --active-threshold 120
npx glasshive --config-dir ~/somewhere
```

| 指定 | 意味 |
| --- | --- |
| `--port <n>` | 待ち受ける番号(127.0.0.1 のみ。既定 4483) |
| `--active-threshold <secs>` | 最後の書き込みから何秒までを「稼働」と見るか(既定 60) |
| `--config-dir <path>` | 覚え書きを置く場所(既定 `$XDG_CONFIG_HOME/glasshive`、無ければ `~/.config/glasshive`) |
| `--no-open` | ブラウザーを自動で開かない |
| `-h`, `--help` | 案内を出す |

読めない指定は黙って既定に倒さず、断って止まる。指定が効いていないことに気づけないまま観るのが、いちばん困る。

## 画面

| 画面 | 出るもの |
| --- | --- |
| **Overview**(`/`) | 巣の一覧。人待ち > 稼働 > 待機 > 最終活動の新しい順。探し・状態・期間(既定 30 日)で絞る。左端の印でタブに留める |
| **Agents** | セッション → 子の整列。状態・課題・枝・作業場所・いまの手・稼働の帯を列ぞろえで。下に統計 |
| **Git** | 生きている枝と作業場所を、本流の上に重ねて描く。誰がどこに居るか。ぶつかりそうな組は表の上に出す |
| **Beads** | 台帳の課題一覧。依存の線・親子・流れ。`bd` を使っていない巣には案内だけを出す |
| **窓**(右の引き出し) | 会話 / 課題 / 指し。開いている先は URL に載るので、貼れば相手の画面でも同じものが開く |

### 鍵盤

| 鍵 | すること |
| --- | --- |
| `⌘1` … `⌘9` | タブ行の位置で移る(1 が Overview、2 から留めたもの) |
| `⌘⇧←` `⌘⇧→` | いま観ているタブを左右へ動かす |
| `Tab` `⇧Tab` | 押しどころを辿る(行・札・並べ替えの見出し・摘み) |
| `Enter` `Space` | 辿り着いた先を押す。行なら会話の窓、札ならその課題や指しが開く |
| `←` `→` | 帯の摘みに居るとき、窓の端を動かす(`⇧` を添えると 10 倍) |
| `Esc` | 窓を閉じる |

Apple の盤でない場合は `⌘` の代わりに `Ctrl`。

押しどころは、載せる手が無くてもすべて鍵盤から辿れる。いま何処に居るかは細い枠で出る。

### 覚え書き

この道具が書く唯一のファイルは `$XDG_CONFIG_HOME/glasshive/preferences.json`。
タブに留めたもの・その並び・見た目の好みだけが入る。

置く前に、その場所が**読みに行く先**(`~/.claude`・正本の置き場・`<巣>/.beads`・`<巣>/.git`)の
下でないことを確かめ、そうであれば断る。**観測元への書き込みは、決めではなく仕組みで塞ぐ。**
覚え書きが読めなくても観測は止まらない(既定に倒れて動き続ける)。

## 手元で開く

```sh
npm install
npm run dev        # http://127.0.0.1:4484
npm run check      # 書式 + 層 + 型 + 検め
npm run build      # 配りものを組む(配りものが外の名前に頼っていないことも見る)
npm start          # 組んだものを 4483 で起動
npm run test:smoke # 組んだ配りものを起動して確かめる
```

`npm run check` が見るのは 4 つ — [Biome](https://biomejs.dev/) の書式と決まり、層の向き
(`scripts/check-architecture.mjs`)、8 つの構成それぞれの型、そして検め(Vitest)。

[Bun](https://bun.com/) でもそのまま動く(1.3 で確かめた)。`npm` を `bun` に読み替えるだけで、
`bun install && bun run dev` から始められる。npm が入っていない手元でも通る。

```sh
bun install        # package-lock.json をそのまま読む(bun.lock は git に入れない)
bun run dev
bun run check
```

繋いだ手順(`build` / `check`)が中で別の手順を呼ぶときは `$npm_execpath` を通す。
`npm run` と直に書くと、bun しか入れていない手元でそこだけ止まる。

## 組み立て

- `src/app-kernel/` — どの層からも使う語彙。`Observation`(観えた / 無い / 観に行けなかった)と `Result`
- `src/domain/` — 導出の規則。純関数だけで、何も読みに行かない
- `src/application/` — 使い道と口(port)。読む先の形はここで決まる
- `src/interface/` — 入口と見せ方。外に出る JSON の形はここだけが知っている
- `src/infrastructure/` — 実際に読む役。ファイル・プロセス・`git`
- `src/frameworks/` — TanStack Start(SPA)と、素の Node で書いた起動口
- `src/composition/` — 組み立て

層の向きは矢印のとおりに断ってある(`interface` と `infrastructure` は `domain` の名前を一切見ない)。
破れば `npm run arch` が落ちる。

詳しくは [ADR 0002](docs/adr/0002-tanstack-start-spa.md)。旧実装から**意図して変えたこと**は
[docs/differences.md](docs/differences.md) に並べてある。

## 決めごと

- [ADR 0001 — 正本から導き、何も書かない](docs/adr/0001-read-only.md)
- [ADR 0002 — TanStack Start(SPA)とクリーンアーキテクチャ](docs/adr/0002-tanstack-start-spa.md)
- [ADR 0003 — 観る範囲をやめ、観る人に渡す](docs/adr/0003-viewer-chooses-scope.md)

## License

MIT
