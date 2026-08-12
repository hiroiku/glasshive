# glasshive

**隔著玻璃，看著你的 AI 代理程式工作。**

[![npm](https://img.shields.io/npm/v/glasshive.svg)](https://www.npmjs.com/package/glasshive)
[![node](https://img.shields.io/node/v/glasshive.svg)](https://nodejs.org)
[![check](https://github.com/hiroiku/glasshive/actions/workflows/check.yml/badge.svg)](https://github.com/hiroiku/glasshive/actions/workflows/check.yml)
[![授權條款](https://img.shields.io/npm/l/glasshive.svg)](../LICENSE)

[你會看到什麼](#你會看到什麼) · [設計上唯讀](#設計上唯讀) · [選項](#選項) · [開發](#開發)

[English](../README.md) · [日本語](README.ja.md) · [简体中文](README.zh-CN.md) · **繁體中文** · [한국어](README.ko.md) · [Español](README.es.md) · [Français](README.fr.md) · [Deutsch](README.de.md)

glasshive 是給 [Claude Code](https://claude.com/claude-code) 用的唯讀本機儀表板。它讀取你磁碟上早已存在的
session 記錄，把你在看的專案——它們的 session 與 subagent、每一個此刻正在做什麼、它們的 issue，
以及使用中的 git 分支——放進同一個畫面。可以把它想成代理程式 session 的 `htop`，只是沒有那個 kill 鍵：
glasshive 絕不寫入 `~/.claude`、你的儲存庫或你的 issue 追蹤器，也無法啟動、停止或操控代理程式。

```sh
npx glasshive
```

它只在 `127.0.0.1:4483` 上提供服務，並開啟你的瀏覽器。不需安裝步驟、不需設定，在你開啟
GitHub 檢視之前，不會有任何東西離開你的機器——發佈的套件沒有任何執行期相依套件。
你需要 Node.js 22.12 或更新的版本，以及 `~/.claude/projects` 底下至少一個 Claude Code 的 session。
建置與驗證都在 macOS 與 Linux 上進行；在 Windows 上，存活 agent 的數量會以「無法觀察」回傳，
因為讀取它需要 `ps`，以及 `/proc/<pid>/cwd` 或 `lsof` 其中之一。

![glasshive 導覽](https://raw.githubusercontent.com/hiroiku/glasshive/main/docs/media/glasshive.gif)

## 你會看到什麼

### Overview

你在看的專案。等你回應的排在最前面，接著是仍在執行的。可以依名稱、狀態或時間範圍篩選，也可以
調整分頁列的順序。一開始是空的——在儲存庫裡執行 `glasshive`，那個儲存庫從此就被記錄下來；或者從
表格上方「找到但沒在看的目錄」裡挑一個加進來。

![Overview](https://raw.githubusercontent.com/hiroiku/glasshive/main/docs/images/overview.png)

### Agents

Session 與它們的 subagent 匯成一棵樹：status、model、effort、token 用量、各自正在處理的 issue 與
worktree、此刻正在執行的工具，以及可以平移和縮放的活動時間軸。下方是 token 與並行數的統計，
範圍與上方的時間窗相同。

![Agents](https://raw.githubusercontent.com/hiroiku/glasshive/main/docs/images/agents.png)

### Work

issue、branch 與 milestone 在同一個畫面上，因為它們本來就是同一件工作的三個面向。在同一個檢視裡
就能互相切換，不必離開。

issue 透過 [`gh`](https://cli.github.com) CLI 從 GitHub 來——glasshive 會問 `gh` 你的 remote
指向哪個儲存庫，判斷方式和 `gh` 自己一樣。sub-issue 會巢狀排列，`blocked by` 會畫成相依邊，
issue 類型、標籤、milestone 與負責人也一併帶來。

branch 與 worktree 疊畫在主 worktree 所在的 branch 上，讓你看得出誰在哪裡。正在動到同一批檔案的
組合會被提到最上面。點一個 ref，就會看到它的 commit、diff 統計，以及有哪些代理程式在上面活動過。
issue 與 branch 只靠 pull request 的 head branch 相接——差一點對上的就讓它保持不相接，而不是用猜的。

![Work](https://raw.githubusercontent.com/hiroiku/glasshive/main/docs/images/work.png)

### Side panel

對話、issue 與 ref 會在右側的面板中開啟。目前開著什麼記在 URL 裡，所以把連結貼給別人，
對方畫面上開的會是同一個東西。Markdown、程式碼與工具呼叫都會呈現出來；原始 transcript 絕不會被改寫。

![Side panel](https://raw.githubusercontent.com/hiroiku/glasshive/main/docs/images/conversation.png)

一個 issue 會把它的留言與時間軸一起帶來：誰貼了標籤、被什麼擋住過、哪個 pull request 引用過它，
就讀在此刻正在做這件事的 agent 旁邊。

![Issue](https://raw.githubusercontent.com/hiroiku/glasshive/main/docs/images/issue.png)

## 設計上唯讀

- **它讀三樣東西，一樣都不寫。** Claude Code 的 session 記錄
  （`~/.claude/projects/**/*.jsonl`）、`git`，以及——透過 `gh` CLI——你的 remote 指向的
  GitHub 儲存庫的 issue。任何 transcript、儲存庫或 issue 都不會被修改。
- **它唯一會寫的檔案是它自己的。** `~/.config/glasshive/preferences.json` 存放你在看的目錄與檢視偏好。
  寫入之前，glasshive 會檢查該路徑不在 `~/.claude`、transcript 根目錄，或它看得到的專案裡的
  `.git` 或 `.beads` 目錄底下，若在其中就拒絕——寫入自己觀察的對象是由結構擋下的，不是靠慣例。
  刪掉這一個檔案，glasshive 寫過的東西就一點也不剩。
- **發佈的套件可以追溯到這個儲存庫。** 每個版本都由 GitHub Actions 透過 OIDC 發佈，並帶有
  provenance attestation，所以 `npm audit signatures` 能把你裝到的套件，對上建置它的 workflow
  與 commit。
- **離開你機器的有兩件事，而且兩件都跟你早就看得到的 issue 有關。** glasshive 只綁定 `127.0.0.1`，
  拒絕 `Host` 標頭不是本機的請求（因此惡意網頁無法透過 DNS rebinding 觸及它），字型也是自行打包
  而不是從 CDN 抓取。所有的對外呼叫就是 GitHub 檢視發出的那兩次：一次是 issue 查詢，透過 `gh`
  發出——所以 glasshive 從不讀取、持有或儲存自己的 token；另一次是負責人的頭像，由 glasshive
  自己的行程從 `avatars.githubusercontent.com` 抓取，不帶任何認證資訊，而且只留在記憶體裡，
  所以你的瀏覽器不會拿到任何 GitHub 的 URL。跟你的 session 有關的任何東西，都不會被送到任何地方。
- **「空的」和「讀不到」不會長得一樣。** 讀不到的欄位會以 `null` 帶著原因一起傳遞，
  所以安靜的畫面不會有歧義。
- **錯誤的選項會大聲失敗。** 無法解讀的旗標會以錯誤結束，而不是默默退回預設值。

## 選項

```sh
npx glasshive                       # http://127.0.0.1:4483
npx glasshive --port 8080           # 監聽其他連接埠
npx glasshive --no-open             # 不開啟瀏覽器
npx glasshive --active-threshold 120  # 距上次寫入多少秒以內仍算 active
npx glasshive --config-dir ~/somewhere  # preferences.json 的存放位置
```

執行 `glasshive --help` 可以看到完整清單。

**指定一個目錄，就是決定開始看它。** `glasshive .` 會記錄並開啟這個儲存庫；不帶路徑的 `glasshive`
在 git 儲存庫裡做同樣的事，不在儲存庫裡則落到 Overview。給出的路徑會解析到它所屬的儲存庫，所以
子目錄或 worktree 都會到同一個地方。

**「在看」是呈現方式，不是允許讀取的範圍。** `~/.claude/projects` 底下的目錄仍然全部依名字被找到，
沒在看的會列在 Overview 裡，一次點擊就能加進來。只有在看的才會被完整讀取，其餘的只花掉一份
session 記錄的一行，剛好夠知道它在哪裡。從分頁上移除只是回到那份清單，什麼都不會被刪除。

### 鍵盤

| 按鍵 | 作用 |
| --- | --- |
| `⌘1` … `⌘9` | 依位置跳到分頁（1 是 Overview） |
| `⌘⇧←` / `⌘⇧→` | 把目前所在的分頁往左或往右挪一格 |
| `Tab` | 在列、標籤、排序標頭與拖曳把手之間移動 |
| `Esc` | 關閉面板 |

所有東西都能用鍵盤到達，而且取得焦點的元素一定會有外框。在非 Apple 鍵盤上，`Ctrl` 取代 `⌘`。

## 開發

```sh
npm install
npm run dev     # http://127.0.0.1:4483
npm run check   # 格式、層邊界、型別、測試
npm run build
```

[Bun](https://bun.com/) 可以直接使用——把 `npm` 換成 `bun` 即可。架構、品質關卡，以及該怎麼參與開發，
請見 [CONTRIBUTING.md](../CONTRIBUTING.md)。

## 支援

發現了 bug，或想要 glasshive 做不到的事？
[開一個 issue](https://github.com/hiroiku/glasshive/issues)。

## 授權條款

MIT — 見 [LICENSE](../LICENSE)。
