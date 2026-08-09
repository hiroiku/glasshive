# glasshive

**隔著玻璃，看著你的 AI 代理程式工作。**

[![npm](https://img.shields.io/npm/v/glasshive.svg)](https://www.npmjs.com/package/glasshive)
[![node](https://img.shields.io/node/v/glasshive.svg)](https://nodejs.org)
[![check](https://github.com/hiroiku/glasshive/actions/workflows/check.yml/badge.svg)](https://github.com/hiroiku/glasshive/actions/workflows/check.yml)
[![授權條款](https://img.shields.io/npm/l/glasshive.svg)](../LICENSE)

[你會看到什麼](#你會看到什麼) · [設計上唯讀](#設計上唯讀) · [選項](#選項) · [開發](#開發)

[English](../README.md) · [日本語](README.ja.md) · [简体中文](README.zh-CN.md) · **繁體中文** · [한국어](README.ko.md) · [Español](README.es.md) · [Français](README.fr.md) · [Deutsch](README.de.md)

glasshive 是給 [Claude Code](https://claude.com/claude-code) 用的唯讀本機儀表板。它讀取你磁碟上早已存在的
session 記錄，把代理程式工作過的每個專案——它的 session 與 subagent、每一個此刻正在做什麼、它的 issue，
以及使用中的 git 分支——放進同一個畫面。可以把它想成代理程式 session 的 `htop`，只是沒有那個 kill 鍵：
glasshive 絕不寫入 `~/.claude`、你的儲存庫或你的 issue 追蹤器，也無法啟動、停止或操控代理程式。

```sh
npx glasshive
```

它只在 `127.0.0.1:4483` 上提供服務（4483 在電話鍵盤上拼出 `HIVE`），並開啟你的瀏覽器。
不需安裝步驟、不需設定、不需網路連線——發佈的套件沒有任何執行期相依套件。你需要 Node.js 22.12
或更新的版本，以及 `~/.claude/projects` 底下至少一個 Claude Code 的 session。

![glasshive 導覽](https://raw.githubusercontent.com/hiroiku/glasshive/main/docs/media/glasshive.gif)

## 你會看到什麼

### Overview

不論你從哪裡啟動 glasshive，代理程式工作過的每個專案都會列出。等你回應的排在最前面，接著是仍在執行的。
可以依名稱、狀態或時間範圍篩選，並把你在意的專案釘到分頁列上。

![Overview](https://raw.githubusercontent.com/hiroiku/glasshive/main/docs/images/overview.png)

### Agents

Session 與它們的 subagent 匯成一棵樹：status、model、effort、token 用量、各自正在處理的 issue 與
worktree、此刻正在執行的工具，以及可以平移和縮放的活動時間軸。下方是 token 與並行數的統計，
範圍與上方的時間窗相同。

![Agents](https://raw.githubusercontent.com/hiroiku/glasshive/main/docs/images/agents.png)

### Git

使用中的 branch 與 worktree 疊畫在預設分支上，讓你看得出誰在哪裡。正在動到同一批檔案的組合會被提到
清單最上面。點一個 ref，就會看到它的 commit、diff 統計，以及有哪些代理程式在上面活動過。

![Git](https://raw.githubusercontent.com/hiroiku/glasshive/main/docs/images/git.png)

### Beads

來自 [`bd`](https://github.com/gastownhall/beads) 的 issue 帳本，含相依邊、父子巢狀結構，以及
open/closed 隨時間的流動。沒有使用 `bd` 的專案會看到一段簡短說明，而不是空白畫面。

![Beads](https://raw.githubusercontent.com/hiroiku/glasshive/main/docs/images/beads.png)

### Side panel

對話、issue 與 ref 會在右側的面板中開啟。目前開著什麼記在 URL 裡，所以把連結貼給別人，
對方畫面上開的會是同一個東西。Markdown、程式碼與工具呼叫都會呈現出來；原始 transcript 絕不會被改寫。

![Side panel](https://raw.githubusercontent.com/hiroiku/glasshive/main/docs/images/conversation.png)

## 設計上唯讀

- **它讀三樣東西，一樣都不寫。** Claude Code 的 session 記錄
  （`~/.claude/projects/**/*.jsonl`）、beads 帳本（`<project>/.beads/issues.jsonl`），以及 `git`。
  任何 transcript、帳本或儲存庫都不會被修改。
- **它唯一會寫的檔案是它自己的。** `~/.config/glasshive/preferences.json` 存放你釘選的分頁與檢視偏好。
  寫入之前，glasshive 會檢查該路徑不在 `~/.claude`、transcript 根目錄，或任何被觀察的 `.beads` 或 `.git`
  目錄底下，若在其中就拒絕——寫入自己觀察的對象是由結構擋下的，不是靠慣例。
- **沒有任何東西離開你的機器。** 它只綁定 `127.0.0.1`，拒絕 `Host` 標頭不是本機的請求
  （因此惡意網頁無法透過 DNS rebinding 觸及它），不發出任何對外請求，
  字型也是自行打包而不是從 CDN 抓取。
- **「空的」和「讀不到」不會長得一樣。** 讀不到的欄位會以 `null` 帶著原因一起傳遞，
  所以安靜的畫面不會有歧義。
- **錯誤的選項會大聲失敗。** 無法解讀的旗標會以錯誤結束，而不是默默退回預設值。

參見 [ADR 0001](adr/0001-read-only.md) 與 [ADR 0003](adr/0003-viewer-chooses-scope.md)。

## 選項

```sh
npx glasshive                       # http://127.0.0.1:4483
npx glasshive --port 8080           # 監聽其他連接埠
npx glasshive --no-open             # 不開啟瀏覽器
npx glasshive --active-threshold 120  # 距上次寫入多少秒以內仍算 active
npx glasshive --config-dir ~/somewhere  # preferences.json 的存放位置
```

執行 `glasshive --help` 可以看到完整清單。範圍不是啟動選項：代理程式工作過的每個專案都會列出，
再由你挑哪些成為分頁。

### 鍵盤

| 按鍵 | 作用 |
| --- | --- |
| `⌘1` … `⌘9` | 依位置跳到分頁（1 是 Overview） |
| `Tab` | 在列、標籤、排序標頭與拖曳把手之間移動 |
| `Esc` | 關閉面板 |

所有東西都能用鍵盤到達，而且取得焦點的元素一定會有外框。在非 Apple 鍵盤上，`Ctrl` 取代 `⌘`。

## 開發

```sh
npm install
npm run dev     # http://127.0.0.1:4484
npm run check   # 格式、層邊界、型別、測試
npm run build
```

[Bun](https://bun.com/) 可以直接使用——把 `npm` 換成 `bun` 即可。架構、品質關卡，以及該怎麼參與開發，
請見 [CONTRIBUTING.md](../CONTRIBUTING.md)。

## 設計決策

- [ADR 0001 — 一切都從 transcript 推導出來，什麼都不寫回去](adr/0001-read-only.md)
- [ADR 0002 — TanStack Start 的 SPA 模式，clean architecture](adr/0002-tanstack-start-spa.md)
- [ADR 0003 — 拿掉 scope 旗標，交給檢視的人選](adr/0003-viewer-chooses-scope.md)
- [與前一版實作相比改了什麼](differences.md)

（這些文件是用日文寫的。）

## 支援

發現了 bug，或想要 glasshive 做不到的事？
[開一個 issue](https://github.com/hiroiku/glasshive/issues)。

相關：[Claude Code](https://claude.com/claude-code) ·
[beads](https://github.com/gastownhall/beads)

## 授權條款

MIT — 見 [LICENSE](../LICENSE)。
