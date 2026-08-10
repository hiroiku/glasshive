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

It serves on `127.0.0.1:4483` only and opens your browser. No install step, no configuration, and
nothing leaves your machine until you open the GitHub view — the published package has zero runtime
dependencies. You need Node.js 22.12 or
newer and at least one Claude Code session under `~/.claude/projects`. It is built and tested on
macOS and Linux; on Windows the live agent count comes back as unobservable, because reading it
needs `ps` and either `/proc/<pid>/cwd` or `lsof`.

![glasshive walkthrough](https://raw.githubusercontent.com/hiroiku/glasshive/main/docs/media/glasshive.gif)

## What you see

### Overview

Every project an agent has worked in, wherever you started glasshive from. The ones waiting for your
input come first, then the ones still running. Filter by name, state, or time span, and pin the
projects you care about to the tab bar.

![Overview](https://raw.githubusercontent.com/hiroiku/glasshive/main/docs/images/overview.png)

### Agents

Sessions and their subagents as one tree: status, model, effort, tokens, the issue and worktree each
one is working in, the tool it is running right now, and an activity timeline you can pan and zoom.
Token and concurrency statistics sit underneath, scoped to the same window.

![Agents](https://raw.githubusercontent.com/hiroiku/glasshive/main/docs/images/agents.png)

### Work

Issues, branches, and milestones on one screen, because they are the same work seen from three
sides. Switch between them without leaving the view.

Issues come from GitHub through the [`gh`](https://cli.github.com) CLI — glasshive asks `gh` which
repository your remotes point at, the same way `gh` decides it — or from a
[`bd`](https://github.com/gastownhall/beads) ledger. Sub-issues nest, `blocked by` is drawn as a
dependency edge, and issue types, labels, milestones and assignees come along.

Branches and worktrees are drawn over the main worktree's branch, so you can see who is where.
Pairs heading for the same files are lifted to the top. Pick a ref to get its commits, diff stats,
and which agents have been active on it. An issue and a branch are joined only by a pull request's
head branch — a near-miss is left unjoined rather than guessed.

### Side panel

Conversations, issues, and refs open in a panel on the right. What is open lives in the URL, so
pasting the link opens the same thing on someone else's screen. Markdown, code, and tool calls are
rendered; the raw transcript is never rewritten.

![Side panel](https://raw.githubusercontent.com/hiroiku/glasshive/main/docs/images/conversation.png)

## Read-only by design

- **It reads four things and writes to none of them.** Claude Code session logs
  (`~/.claude/projects/**/*.jsonl`), the beads ledger (`<project>/.beads/issues.jsonl`), `git`, and —
  through the `gh` CLI — the issues of the GitHub repository your remotes point at. No transcript,
  ledger, repository, or issue is ever modified.
- **The one file it writes is its own.** `~/.config/glasshive/preferences.json` holds your pinned
  tabs and view preferences. Before writing, glasshive checks that the path is not inside `~/.claude`,
  the transcripts root, or any observed `.beads` or `.git` directory, and refuses if it is — writing
  to what it observes is blocked by construction, not by convention. Delete that one file and
  nothing glasshive has ever written is left behind.
- **The published package is traceable to this repository.** Every version is published from GitHub
  Actions over OIDC and carries a provenance attestation, so `npm audit signatures` can check the
  package you installed against the workflow and the commit it was built from.
- **Two things leave your machine, and both are about issues you can already see.** glasshive binds
  to `127.0.0.1`, rejects requests whose `Host` header is not local (so a hostile page cannot reach
  it by DNS rebinding), and bundles its own fonts instead of fetching them from a CDN. The GitHub
  view makes the two outbound calls there are: the issue query, which goes through `gh` — so
  glasshive never reads, holds, or stores a token of its own — and the assignee avatars, which
  glasshive's own process fetches from `avatars.githubusercontent.com` with credentials omitted and
  keeps in memory only, so your browser is never handed a GitHub URL. Nothing about your sessions is
  ever sent anywhere.
- **"Empty" and "could not read" never look the same.** A field that could not be read is carried as
  `null` with the reason attached, so a quiet screen is never ambiguous.
- **Bad options fail loudly.** An unreadable flag exits with an error instead of silently falling
  back to a default.

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
| `⌘⇧←` / `⌘⇧→` | Move the tab you are on one place left or right |
| `Tab` | Move through rows, chips, sort headers, and handles |
| `Esc` | Close the panel |

Everything is reachable from the keyboard, and the focused element is always outlined. `Ctrl`
replaces `⌘` on non-Apple keyboards.

## Development

```sh
npm install
npm run dev     # http://127.0.0.1:4483
npm run check   # format, layer boundaries, types, tests
npm run build
```

[Bun](https://bun.com/) works as-is — swap `npm` for `bun`. See [CONTRIBUTING.md](CONTRIBUTING.md)
for the architecture, the quality gates, and how to work on this.

## Support

Found a bug, or want something glasshive does not do?
[Open an issue](https://github.com/hiroiku/glasshive/issues).

## License

MIT — see [LICENSE](LICENSE).
