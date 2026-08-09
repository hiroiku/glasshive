# glasshive

**Watch your AI agents work, through glass.**

[![npm](https://img.shields.io/npm/v/glasshive.svg)](https://www.npmjs.com/package/glasshive)
[![node](https://img.shields.io/node/v/glasshive.svg)](https://nodejs.org)
[![check](https://github.com/hiroiku/glasshive/actions/workflows/check.yml/badge.svg)](https://github.com/hiroiku/glasshive/actions/workflows/check.yml)
[![license](https://img.shields.io/npm/l/glasshive.svg)](LICENSE)

[What you see](#what-you-see) · [Read-only by design](#read-only-by-design) · [Options](#options) · [Development](#development)

**English** · [日本語](docs/README.ja.md) · [简体中文](docs/README.zh-CN.md) · [繁體中文](docs/README.zh-TW.md) · [한국어](docs/README.ko.md) · [Español](docs/README.es.md) · [Français](docs/README.fr.md) · [Deutsch](docs/README.de.md)

glasshive is a read-only local dashboard for [Claude Code](https://claude.com/claude-code). It reads
the session logs already sitting on your disk and puts every project an agent has worked in — its
sessions and subagents, what each one is doing right now, its issues, and its live git branches — on
one screen. Think `htop` for agent sessions, without the kill key: glasshive never writes to
`~/.claude`, to your repositories, or to your issue tracker, and it cannot start, stop, or steer an
agent.

```sh
npx glasshive
```

It serves on `127.0.0.1:4483` only (4483 spells `HIVE` on a phone keypad) and opens your browser.
No install step, no configuration, no network access — the published package has zero runtime
dependencies. You need Node.js 22.12 or newer and at least one Claude Code session under
`~/.claude/projects`.

![glasshive walkthrough](https://raw.githubusercontent.com/hiroiku/glasshive/main/docs/media/glasshive.gif)

## What you see

### Overview

Every project an agent has worked in, wherever you started glasshive from. The ones waiting on you
come first, then the ones still running. Filter by name, state, or time span, and pin the projects
you care about to the tab bar.

![Overview](https://raw.githubusercontent.com/hiroiku/glasshive/main/docs/images/overview.png)

### Agents

Sessions and their subagents as one tree: status, model, effort, tokens, the issue and worktree each
one is working in, the tool it is running right now, and an activity timeline you can pan and zoom.
Token and concurrency statistics sit underneath, scoped to the same window.

![Agents](https://raw.githubusercontent.com/hiroiku/glasshive/main/docs/images/agents.png)

### Git

Live branches and worktrees drawn over the default branch, so you can see who is where. Pairs that
are heading for the same files are lifted to the top of the list. Pick a ref to get its commits,
diff stats, and which agents have been active on it.

![Git](https://raw.githubusercontent.com/hiroiku/glasshive/main/docs/images/git.png)

### Beads

The issue ledger from [`bd`](https://github.com/gastownhall/beads), with dependency edges,
parent–child nesting, and open/closed flow over time. Projects that do not use `bd` get a short
note instead of an empty screen.

![Beads](https://raw.githubusercontent.com/hiroiku/glasshive/main/docs/images/beads.png)

### Side panel

Conversations, issues, and refs open in a panel on the right. What is open lives in the URL, so
pasting the link opens the same thing on someone else's screen. Markdown, code, and tool calls are
rendered; the raw transcript is never rewritten.

![Side panel](https://raw.githubusercontent.com/hiroiku/glasshive/main/docs/images/conversation.png)

## Read-only by design

- **It reads three things and writes to none of them.** Claude Code session logs
  (`~/.claude/projects/**/*.jsonl`), the beads ledger (`<project>/.beads/issues.jsonl`), and `git`.
  No transcript, ledger, or repository is ever modified.
- **The one file it writes is its own.** `~/.config/glasshive/preferences.json` holds your pinned
  tabs and view preferences. Before writing, glasshive checks that the path is not inside `~/.claude`,
  the transcripts root, or any observed `.beads` or `.git` directory, and refuses if it is — writing
  to what it observes is blocked by construction, not by convention.
- **Nothing leaves your machine.** It binds to `127.0.0.1`, rejects requests whose `Host` header is
  not local (so a hostile page cannot reach it by DNS rebinding), makes no outbound requests, and
  bundles its own fonts instead of fetching them from a CDN.
- **"Empty" and "could not read" never look the same.** A field that could not be read is carried as
  `null` with the reason attached, so a quiet screen is never ambiguous.
- **Bad options fail loudly.** An unreadable flag exits with an error instead of silently falling
  back to a default.

See [ADR 0001](docs/adr/0001-read-only.md) and [ADR 0003](docs/adr/0003-viewer-chooses-scope.md).

## Options

```sh
npx glasshive                       # http://127.0.0.1:4483
npx glasshive --port 8080           # listen somewhere else
npx glasshive --no-open             # do not open the browser
npx glasshive --active-threshold 120  # seconds since last write that still counts as active
npx glasshive --config-dir ~/somewhere  # where preferences.json is kept
```

Run `glasshive --help` for the full list. Scope is not a startup option: every project an agent has
worked in is listed, and you pick which ones become tabs.

### Keyboard

| Key | Does |
| --- | --- |
| `⌘1` … `⌘9` | Jump to a tab by position (1 is Overview) |
| `Tab` | Move through rows, chips, sort headers, and handles |
| `Esc` | Close the panel |

Everything is reachable from the keyboard, and the focused element is always outlined. `Ctrl`
replaces `⌘` on non-Apple keyboards.

## Development

```sh
npm install
npm run dev     # http://127.0.0.1:4484
npm run check   # format, layer boundaries, types, tests
npm run build
```

[Bun](https://bun.com/) works as-is — swap `npm` for `bun`. See [CONTRIBUTING.md](CONTRIBUTING.md)
for the architecture, the quality gates, and how to work on this.

## Design decisions

- [ADR 0001 — Derive everything from the transcripts, write nothing back](docs/adr/0001-read-only.md)
- [ADR 0002 — TanStack Start in SPA mode, clean architecture](docs/adr/0002-tanstack-start-spa.md)
- [ADR 0003 — Drop the scope flag, let the viewer choose](docs/adr/0003-viewer-chooses-scope.md)
- [What changed from the previous implementation](docs/differences.md)

(These are written in Japanese.)

## Support

Found a bug, or want something glasshive does not do?
[Open an issue](https://github.com/hiroiku/glasshive/issues).

Related: [Claude Code](https://claude.com/claude-code) ·
[beads](https://github.com/gastownhall/beads)

## License

MIT — see [LICENSE](LICENSE).
