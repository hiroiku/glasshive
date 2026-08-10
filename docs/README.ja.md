# glasshive

**AI エージェントの仕事を、ガラス越しに眺める。**

[![npm](https://img.shields.io/npm/v/glasshive.svg)](https://www.npmjs.com/package/glasshive)
[![node](https://img.shields.io/node/v/glasshive.svg)](https://nodejs.org)
[![check](https://github.com/hiroiku/glasshive/actions/workflows/check.yml/badge.svg)](https://github.com/hiroiku/glasshive/actions/workflows/check.yml)
[![license](https://img.shields.io/npm/l/glasshive.svg)](../LICENSE)

[見えるもの](#見えるもの) · [読み取り専用という設計](#読み取り専用という設計) · [オプション](#オプション) · [開発](#開発)

[English](../README.md) · **日本語** · [简体中文](README.zh-CN.md) · [繁體中文](README.zh-TW.md) · [한국어](README.ko.md) · [Español](README.es.md) · [Français](README.fr.md) · [Deutsch](README.de.md)

glasshive は [Claude Code](https://claude.com/claude-code) のための、読み取り専用のローカルな
ダッシュボードだ。すでにディスクにあるセッションログを読み、エージェントが作業したすべての
プロジェクトを — そのセッションとサブエージェント、それぞれが今なにをしているか、issue、
生きている git のブランチを — 1 つの画面に載せる。エージェントのセッション版の `htop`、
ただし kill のキーは無い。glasshive は `~/.claude` にも、リポジトリにも、issue トラッカーにも
書き込まないし、エージェントを起こすことも、止めることも、動かすこともできない。

```sh
npx glasshive
```

待ち受けるのは `127.0.0.1:4483` だけで、ブラウザーを開く。インストールの手順も、設定も、
ネットワークへのアクセスも無い — 公開しているパッケージの実行時の依存はゼロだ。要るのは
Node.js 22.12 以降と、`~/.claude/projects` の下に少なくとも 1 つの Claude Code のセッション。
組み立てと動作の確認は macOS と Linux でしている。Windows では生きているエージェントの数が
「観測できなかった」として返る — 数えるのに `ps` と、`/proc/<pid>/cwd` か `lsof` が要るからだ。

![glasshive の一巡り](https://raw.githubusercontent.com/hiroiku/glasshive/main/docs/media/glasshive.gif)

## 見えるもの

### Overview

glasshive をどこで起動しても、エージェントが作業したすべてのプロジェクトが出る。あなたの
入力を待っているものが先に、次にまだ動いているものが並ぶ。名前・状態・時間の幅で絞り込み、
気になるプロジェクトをタブバーに留められる。

![Overview](https://raw.githubusercontent.com/hiroiku/glasshive/main/docs/images/overview.png)

### Agents

セッションとそのサブエージェントを 1 つの木に。Status、Model、Effort、トークン、それぞれが
作業している issue と Worktree、いま走らせているツール、そして掴んで動かせる活動の時系列。
その下に、同じ時間の幅で切ったトークンと同時実行の統計が並ぶ。

![Agents](https://raw.githubusercontent.com/hiroiku/glasshive/main/docs/images/agents.png)

### Git

生きているブランチと worktree を主たる worktree が出しているブランチの上に描くので、誰がどこにいるかが見える。
同じファイルへ向かっている組は一覧の上へ持ち上がる。ref を選べば、そのコミット、差分の統計、
そこで動いていたエージェントが出る。

![Git](https://raw.githubusercontent.com/hiroiku/glasshive/main/docs/images/git.png)

### Beads

[`bd`](https://github.com/gastownhall/beads) の issue の台帳を、依存の辺、親子の入れ子、
時間に沿った open/closed の流れとともに。`bd` を使っていないプロジェクトには、空の画面では
なく短い断りが出る。

![Beads](https://raw.githubusercontent.com/hiroiku/glasshive/main/docs/images/beads.png)

### Side panel

会話、issue、ref は右のパネルに開く。何を開いているかは URL に入るので、そのリンクを貼れば
他の人の画面でも同じものが開く。Markdown、コード、ツールの呼び出しは描くが、生のセッション
ログを書き換えることはしない。

![Side panel](https://raw.githubusercontent.com/hiroiku/glasshive/main/docs/images/conversation.png)

## 読み取り専用という設計

- **読むのは 3 つ、そのどれにも書かない。** Claude Code のセッションログ
  (`~/.claude/projects/**/*.jsonl`)、beads の台帳(`<project>/.beads/issues.jsonl`)、そして `git`。
  セッションログも台帳もリポジトリも、書き換えられることはない。
- **書く 1 つのファイルは、自分のものだけ。** `~/.config/glasshive/preferences.json` に、留めた
  タブと表示の好みが入る。書く前に glasshive は、そのパスが `~/.claude`、セッションログの
  ルートディレクトリ、観測している `.beads` や `.git` のディレクトリの中に無いことを確かめ、
  中にあれば断る — 観測している先へ書かないことは、約束ではなく仕組みで塞いである。
  このファイルを消せば、glasshive が書いたものは 1 つも残らない。
- **公開しているパッケージは、このリポジトリまで辿れる。** どのバージョンも GitHub Actions から
  OIDC で publish していて provenance の attestation が付くので、`npm audit signatures` で、
  手元に入れたパッケージを、組み立てた workflow とコミットまで照合できる。
- **何もこの機械から出ない。** `127.0.0.1` に結び、`Host` ヘッダーがローカルでない要求は
  拒み(敵意のあるページが DNS リバインディングで届かないように)、外へは何も投げず、
  フォントは CDN から取らずに自分で抱えている。
- **「無い」と「読めなかった」が同じに見えることはない。** 読めなかった欄は理由を添えた
  `null` として運ばれるので、静かな画面が曖昧になることはない。
- **不正なオプションは、はっきり失敗する。** 読めない指定は、黙って既定へ落ちるのではなく
  エラーで終わる。

## オプション

```sh
npx glasshive                       # http://127.0.0.1:4483
npx glasshive --port 8080           # 別のポートで待ち受ける
npx glasshive --no-open             # ブラウザーを開かない
npx glasshive --active-threshold 120  # 最後の書き込みから何秒までを active と見るか
npx glasshive --config-dir ~/somewhere  # preferences.json を置く場所
```

全部の一覧は `glasshive --help` で。観測する範囲は起動時のオプションではない。エージェントが
作業したすべてのプロジェクトが並び、どれをタブにするかはあなたが選ぶ。

### キーボード

| キー | 何が起きるか |
| --- | --- |
| `⌘1` … `⌘9` | 位置でタブへ飛ぶ(1 は Overview) |
| `⌘⇧←` / `⌘⇧→` | いま居るタブを 1 つ左右へ動かす |
| `Tab` | 行、チップ、並べ替えの見出し、つまみを順に辿る |
| `Esc` | パネルを閉じる |

すべてキーボードから届き、フォーカスのある要素には必ず輪郭が付く。Apple 以外のキーボードでは
`⌘` の代わりに `Ctrl` を使う。

## 開発

```sh
npm install
npm run dev     # http://127.0.0.1:4483
npm run check   # フォーマット・レイヤー境界・型・テスト
npm run build
```

[Bun](https://bun.com/) もそのまま動く — `npm` を `bun` に置き換えるだけだ。アーキテクチャ、
品質ゲート、進め方は [CONTRIBUTING.md](../CONTRIBUTING.md) を参照。

## サポート

バグを見つけた、あるいは glasshive にできないことが欲しい?
[issue を立ててほしい](https://github.com/hiroiku/glasshive/issues)。

関連: [Claude Code](https://claude.com/claude-code) ·
[beads](https://github.com/gastownhall/beads)

## ライセンス

MIT — [LICENSE](../LICENSE) を参照。
