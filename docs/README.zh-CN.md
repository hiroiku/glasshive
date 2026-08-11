# glasshive

**隔着玻璃，看你的 AI 智能体工作。**

[![npm](https://img.shields.io/npm/v/glasshive.svg)](https://www.npmjs.com/package/glasshive)
[![node](https://img.shields.io/node/v/glasshive.svg)](https://nodejs.org)
[![check](https://github.com/hiroiku/glasshive/actions/workflows/check.yml/badge.svg)](https://github.com/hiroiku/glasshive/actions/workflows/check.yml)
[![license](https://img.shields.io/npm/l/glasshive.svg)](../LICENSE)

[你能看到什么](#你能看到什么) · [设计上只读](#设计上只读) · [选项](#选项) · [开发](#开发)

[English](../README.md) · [日本語](README.ja.md) · **简体中文** · [繁體中文](README.zh-TW.md) · [한국어](README.ko.md) · [Español](README.es.md) · [Français](README.fr.md) · [Deutsch](README.de.md)

glasshive 是一个面向 [Claude Code](https://claude.com/claude-code) 的只读本地仪表盘。它读取已经躺在你
磁盘上的会话记录，把智能体工作过的每个项目 —— 它的会话与子智能体、每一个此刻正在做什么、它的 issue，
以及它当前活跃的 git 分支 —— 放到同一块屏幕上。可以把它想成智能体会话的 `htop`，只是没有 kill 键：
glasshive 从不写入 `~/.claude`、你的仓库或你的 issue 追踪器，也无法启动、停止或操控一个智能体。

```sh
npx glasshive
```

它只在 `127.0.0.1:4483` 上提供服务，并打开你的浏览器。没有安装步骤，没有配置，
在你打开 GitHub 视图之前没有任何东西离开你的机器 —— 发布出来的包没有任何运行时依赖。
你需要 Node.js 22.12 或更新的版本，以及 `~/.claude/projects`
下至少一个 Claude Code 会话。构建和验证都在 macOS 与 Linux 上进行；在 Windows 上，存活 agent
的数量会以「无法观察」返回，因为读取它需要 `ps`，以及 `/proc/<pid>/cwd` 或 `lsof` 之一。

![glasshive walkthrough](https://raw.githubusercontent.com/hiroiku/glasshive/main/docs/media/glasshive.gif)

## 你能看到什么

### Overview

智能体工作过的每个项目，无论你从哪里启动 glasshive。等着你回应的排在前面，然后是仍在运行的。可以按
名称、状态或时间范围筛选，并把你在意的项目固定到标签栏上。

![Overview](https://raw.githubusercontent.com/hiroiku/glasshive/main/docs/images/overview.png)

### Agents

会话和它们的子智能体汇成一棵树：Status、Model、Effort、token 数、各自所在的 issue 和 Worktree、
此刻正在运行的工具，以及一条可以平移和缩放的活动时间轴。下方是 token 与并发统计，范围与上面同一个
时间窗口。

![Agents](https://raw.githubusercontent.com/hiroiku/glasshive/main/docs/images/agents.png)

### Work

issue、分支和 milestone 放在同一块屏幕上，因为它们本来就是同一份工作的三个侧面。在它们之间切换，
不用离开当前视图。

issue 来自 GitHub，通过 [`gh`](https://cli.github.com) CLI 读取 —— glasshive 会问 `gh` 你的 remote
指向哪个仓库，判断方式和 `gh` 自己一样。sub-issue 会嵌套，`blocked by` 会画成依赖关系的连线，
issue 类型、标签、milestone 和负责人也一并带来。

分支和 worktree 画在主 worktree 所在分支之上，让你看清谁在哪里。正在改动同一批文件的组合会被提到
顶部。选中一个 ref，就能看到它的提交、差异统计，以及哪些智能体在它上面活动过。issue 和分支只靠
pull request 的 head 分支相连 —— 差一点点对上的，宁可留着不连，也不去猜。

![Work](https://raw.githubusercontent.com/hiroiku/glasshive/main/docs/images/work.png)

### Side panel

对话、issue 和 ref 在右侧的面板中打开。当前打开的是什么记在 URL 里，所以把链接贴给别人，对方屏幕上
打开的就是同一处。Markdown、代码和工具调用都会被渲染；原始的会话记录从不会被改写。

![Side panel](https://raw.githubusercontent.com/hiroiku/glasshive/main/docs/images/conversation.png)

一个 issue 会把它的评论和时间线一起带来：谁打了标签、被什么挡住过、哪个 pull request 引用过它，
就读在此刻正在做这件事的 agent 旁边。

![Issue](https://raw.githubusercontent.com/hiroiku/glasshive/main/docs/images/issue.png)

## 设计上只读

- **它读三样东西，一样都不写。** Claude Code 的会话记录（`~/.claude/projects/**/*.jsonl`）、`git`，
  以及 —— 通过 `gh` CLI —— 你的 remote 指向的 GitHub 仓库的 issue。
  任何会话记录、仓库或 issue 都不会被修改。
- **它唯一会写的文件是它自己的。** `~/.config/glasshive/preferences.json` 保存你固定的标签和视图偏好。
  写入之前，glasshive 会检查这个路径不在 `~/.claude`、会话记录的根目录，或它能看到的项目下的
  `.git` 或 `.beads` 目录里面，只要在就拒绝 —— 不写入自己观察的东西，是由构造挡住的，不是靠约定。
  删掉这一个文件，glasshive 写过的东西就一点也不剩。
- **发布出来的包可以追溯到这个仓库。** 每个版本都由 GitHub Actions 通过 OIDC 发布，并带有
  provenance attestation，所以 `npm audit signatures` 能把你装到的包，对上构建它的 workflow
  和 commit。
- **离开你机器的只有两件事，而且都跟你本来就能看到的 issue 有关。** glasshive 绑定到 `127.0.0.1`，
  拒绝 `Host` 头不是本地的请求（这样恶意页面无法通过 DNS 重绑定够到它），并且自带字体，而不是从
  CDN 取。仅有的两次对外调用都出自 GitHub 视图：一次是 issue 查询，通过 `gh` 发出 —— glasshive
  从不读取、持有或保存自己的 token —— 另一次是负责人的头像，由 glasshive 自己的进程从
  `avatars.githubusercontent.com` 取，不带凭据，而且只放在内存里，所以你的浏览器从不会拿到任何
  GitHub 的 URL。你的会话里的任何东西都不会被送到任何地方。
- **“空”和“读不到”永远不会长得一样。** 读不到的字段会以 `null` 的形式带上原因一起传下来，所以一块
  安静的屏幕从不含糊。
- **错误的选项会大声失败。** 读不懂的参数会带着错误退出，而不是悄悄回退到默认值。

## 选项

```sh
npx glasshive                       # http://127.0.0.1:4483
npx glasshive --port 8080           # 监听其他端口
npx glasshive --no-open             # 不打开浏览器
npx glasshive --active-threshold 120  # 距上次写入多少秒以内仍算 active
npx glasshive --config-dir ~/somewhere  # preferences.json 的存放位置
```

运行 `glasshive --help` 查看完整列表。范围不是启动选项：智能体工作过的每个项目都会被列出来，由你来选
哪些变成标签。

### 键盘

| 按键 | 作用 |
| --- | --- |
| `⌘1` … `⌘9` | 按位置跳到某个标签（1 是 Overview） |
| `⌘⇧←` / `⌘⇧→` | 把当前所在的标签向左或向右挪一位 |
| `Tab` | 在行、chip、排序表头和手柄之间移动 |
| `Esc` | 关闭面板 |

所有东西都能用键盘到达，获得焦点的元素始终带有描边。在非 Apple 键盘上，`Ctrl` 代替 `⌘`。

## 开发

```sh
npm install
npm run dev     # http://127.0.0.1:4483
npm run check   # 格式、层边界、类型、测试
npm run build
```

[Bun](https://bun.com/) 可以直接用 —— 把 `npm` 换成 `bun` 即可。架构、质量门禁，以及如何参与开发，
见 [CONTRIBUTING.md](../CONTRIBUTING.md)。

## 支持

发现了 bug，或者想要 glasshive 还做不到的事？
[提一个 issue](https://github.com/hiroiku/glasshive/issues)。

## 许可证

MIT —— 见 [LICENSE](../LICENSE)。
