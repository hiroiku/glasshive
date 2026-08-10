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

它只在 `127.0.0.1:4483` 上提供服务（4483 在电话键盘上拼出 `HIVE`），并打开你的浏览器。没有安装步骤，
没有配置，不访问网络 —— 发布出来的包没有任何运行时依赖。你需要 Node.js 22.12 或更新的版本，以及
`~/.claude/projects` 下至少一个 Claude Code 会话。

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

### Git

当前的分支和 worktree 画在主 worktree 所在分支之上，让你看清谁在哪里。正在改动同一批文件的组合会被提到列表顶部。
选中一个 ref，就能看到它的提交、差异统计，以及哪些智能体在它上面活动过。

![Git](https://raw.githubusercontent.com/hiroiku/glasshive/main/docs/images/git.png)

### Beads

来自 [`bd`](https://github.com/gastownhall/beads) 的 issue 账本，带依赖关系的连线、父子嵌套，以及
open/closed 随时间的流动。不使用 `bd` 的项目会得到一条简短说明，而不是一块空屏幕。

![Beads](https://raw.githubusercontent.com/hiroiku/glasshive/main/docs/images/beads.png)

### Side panel

对话、issue 和 ref 在右侧的面板中打开。当前打开的是什么记在 URL 里，所以把链接贴给别人，对方屏幕上
打开的就是同一处。Markdown、代码和工具调用都会被渲染；原始的会话记录从不会被改写。

![Side panel](https://raw.githubusercontent.com/hiroiku/glasshive/main/docs/images/conversation.png)

## 设计上只读

- **它读三样东西，一样都不写。** Claude Code 的会话记录（`~/.claude/projects/**/*.jsonl`）、beads
  账本（`<project>/.beads/issues.jsonl`），以及 `git`。任何会话记录、账本或仓库都不会被修改。
- **它唯一会写的文件是它自己的。** `~/.config/glasshive/preferences.json` 保存你固定的标签和视图偏好。
  写入之前，glasshive 会检查这个路径不在 `~/.claude`、会话记录的根目录，或任何被观察的 `.beads` 或
  `.git` 目录里面，只要在就拒绝 —— 不写入自己观察的东西，是由构造挡住的，不是靠约定。
- **没有东西离开你的机器。** 它绑定到 `127.0.0.1`，拒绝 `Host` 头不是本地的请求（这样恶意页面无法
  通过 DNS 重绑定够到它），不发出任何对外请求，并且自带字体，而不是从 CDN 取。
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

相关：[Claude Code](https://claude.com/claude-code) ·
[beads](https://github.com/gastownhall/beads)

## 许可证

MIT —— 见 [LICENSE](../LICENSE)。
