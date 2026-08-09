# ADR 0002 — TanStack Start(SPA)とクリーンアーキテクチャ

- 状態: 有効
- 置き換えるもの: 依存ゼロの Node ESM サーバー + 別ビルドの React SPA

## 背景

前の作りは「依存ゼロの Node ESM サーバー(`server/*.js`)+ Vite で組んだ React SPA(`web/`)」だった。
動いてはいたが、次の 3 つが行き止まりだった。

- **導出が手続きの中に埋まっていた。** 3 状態・応答待ち・稼働区間・プロセス帰属の規則が
  走査の途中に書かれていて、ファイルシステムを用意しないと 1 つも確かめられない
- **契約が二重に手書きだった。** サーバーが組む JSON の形を、画面の側でも 269 行の型として書いていた。
  ずれても誰も気づかない
- **境目がディレクトリの分け方でしか表されていなかった。** 観測対象ごとに正本も語彙も違うのに、
  それを守る仕組みが無い

## 決めたこと

### 単一のコードベースを TanStack Start(SPA モード)に載せる

- 画面を描くのはブラウザーだけ。器(`_shell.html`)だけを組み立て時に一度描く
- サーバーの側の口は **server function**。戻り値の型が呼ぶ側までそのまま通るので、
  手書きの契約と `fetchJson<T>` がまるごと消える
- **合図(SSE)だけは server route** にする。`EventSource` は URL を GET する道具なので
  生成された server function の道には向けられない。切れたときの繋ぎ直しを無料でくれるのも大きい。
  `curl -N` で人が確かめられることも、観るための道具では効く
- 監視の器官はプロセスに 1 つだけ持ち、繋がってきた口はそこへ相乗りする

### 起動口は自分で書く

Nitro は入れない。127.0.0.1 だけに縛ること、`Host` を見て断ること、道を遡らせないこと、
ブラウザーを開くこと — どれもこちらで握りたいものばかりだった。
`src/frameworks/node/` に素の Node で書き、`tsconfig.launcher.json` の `paths: {}` で
**起動口がアプリ層に触ったらコンパイルが落ちる**ようにしてある。

配りものは `dist/client`(静的)+ `dist/server/server.js`(`fetch` ハンドラー)+ `dist/launcher`。
`npm run build` の最後に、Node の組み込み以外の名前を 1 つでも参照していたら落とす検めが走る。
公開ランタイム依存はゼロのまま(`dependencies` が空)。

### 層を、矢印のとおりに断つ

```
app-kernel  → 何にも依らない
domain      → app-kernel
application → domain, app-kernel
interface   → application, app-kernel          （domain を見ない）
infrastructure → application, app-kernel        （domain を見ない）
frameworks  → interface, composition, app-kernel（application も domain も見ない）
composition → frameworks 以外のすべて
```

`interface` と `infrastructure` が `domain` を見ないので、口(port)が運ぶのは**生の材料**であり、
読み解くのは `application` の仕事になる。読む役を差し替えても導出の規則は動かない。

- 守らせるのは `tsconfig.layers.json`(構成ごとの型検査)と `scripts/check-architecture.mjs`
- 検めの側にも同じ決まりを敷く。`test/<層>/` は `~/<層>` と `~/app-kernel` しか import できない。
  層をまたぐ形が要るときは、突き合わせる役の署名から引く
  (`type ProjectJson = Parameters<typeof deriveRows>[0][number]`)

### 導出はすべて純関数へ

3 状態、応答待ちの区別、稼働区間の束ね、プロセスの帰属、slug の併合、会話の還元、
台帳の解析、消費の畳み込み、`git` の出力の読み取り — **文字列と数値だけを受け取る形にした。**
不純なまま残るのは 8 つ(ディレクトリの列挙 / stat / 末尾読み / realpath / バイト単位の頁送り /
プロセスの列挙 / `git` の実行 / 監視)。

会話の頁送りだけは純化できない(fd と大きさが本質)。窓と上限の値は domain に置き、
実装はそれを参照する。

### 見た目

`old/web/src/` を移し、データの側だけ繋ぎ替えた。作り直していない。

- CSS は 1 枚のまま持ってきて、後で 8 つに分けた。**id / class の名前を 1 文字も変えず、
  包む要素も増やしていない** — subgrid は親が敷いた筋を直接の子が継ぐので、間に何か挟むと崩れる
- 8 つは `@import` で 1 枚に束ねる。読み込む順が重なりの勝ち負けを決めるので、順は動かさない
- 画面を渡り歩く道は Context へ移した。9 つのファイル・30 箇所以上を貫いていた受け渡しが消えた
- 窓の在り処は URL(search params)に載せた。開閉の覚えと焦点の型が丸ごと消え、
  **戻る印が効くようになった**(前の作りは履歴を差し替えるだけだった)
- 印付けと色付け(markdown / highlight)は窓の束へ寄せた。窓を開けるまで届かない

## 代償

- サーバーの成果物が大きくなった(62 kB → 670 kB / gzip 137 kB)。手元で動く道具なので払う
- ファイルの数は増えた。増えたぶん、1 つずつは短く、確かめる相手がはっきりした
- `old/` を残して並べて比べる期間が要った。突き合わせの層は移し終えたら消す

## 移していないもの

コードグラフ(`Code` の画面 / `/api/code*` / `node:sqlite` / High-impact symbols)は移さない。
画面は Agents / Git / Beads の 3 つ。
