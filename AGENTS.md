# Agent Instructions

glasshive — a read-only dashboard for watching Claude Code sessions and their subagents.
It reads `~/.claude/projects/**/*.jsonl`, `git`, and GitHub issues through the `gh` CLI. It writes nothing back to anything it observes.

`CLAUDE.md` is a symlink to this file. Edit this one.

## Build & Test

```sh
npm install
npm run dev          # http://127.0.0.1:4483 (falls through to the next free port if taken)
npm run check        # biome ci + layer boundaries + types (8 tsconfigs) + tests
npm run build        # vite build + launcher tsc + external verification
npm start            # http://127.0.0.1:4483 — what users actually get
npm run test:visual  # what the CSS actually paints, in a real browser
```

`npm run check` is the gate. Run it before saying anything is done. Bun works as-is —
swap `npm` for `bun` (composite scripts use `$npm_execpath`).

**`check` cannot see CSS.** It runs on happy-dom, which has no layout and no cascade, so a rule
that is written but paints nothing passes it. The rules that carry an `Observation` claim — the
hatch for "we could not read this", the dashed flag for "this time is a substitute", the dotted
line for "still reading", the filled bar for "this much of the source has been read", the held
lines for "content is coming here" — are pinned in `test/visual/`, which renders the real
components with the real stylesheet in Chromium and counts pixels. **Run `npm run test:visual`
whenever you touch those rules.** It needs a browser once: `npx playwright install chromium`.

## Architecture

Clean architecture, enforced by `scripts/check-architecture.mjs` — a layer that imports across an
arrow it is not allowed to use fails the build, not the review.

```
app-kernel   ← nothing
domain       ← app-kernel
application  ← app-kernel, domain
interface    ← app-kernel, application
infrastructure ← app-kernel, application
frameworks   ← app-kernel, interface, composition
composition  ← everything except frameworks
```

`domain` never crosses a bounded context (`sessions` / `issues` / `git` / `workspace`).

Three ideas carry the design. `Observation<T>` (`observed` | `absent` | `unobservable`) keeps
"there was nothing" apart from "we could not look" — collapsing them is the one lie an observation
tool must never tell. Repositories reconstruct our own model from a store we know the shape of;
integrations translate someone else's program's answer. Exactly one port writes anything
(`ViewerPreferencesRepository`), and it refuses to write under `~/.claude`, the transcripts root,
or a `.git` or `.beads` directory inside any project it can see.

See [CONTRIBUTING.md](CONTRIBUTING.md) for the full layout, the test projects, and how to work here.

## Conventions

**Comments explain the intent of the code they sit on.** Why this code is the way it is — not what
changed, not what an older implementation did, not what a future one might want. No history, no
ADRs, no provisions for the future.

**Comments and test names are written in Japanese. Everything else is English:** identifiers, UI
strings, `--help` output, error text a user reads, and all user-facing documentation.
`test/contracts/ui-language.spec.ts` strips comments and fails if Japanese reaches a string literal
or JSX text under `src/frameworks/tanstack`.

"Written in Japanese" means ordinary Japanese technical prose — the register of any engineering
document. It does **not** mean translating the English away:

- **Never translate a technical term.** Identifiers, type names, API names, filenames, CSS
  properties and values keep their original spelling, quoted in backticks: `transcript`, `subgrid`,
  `user-select`, `Observation`, `mkdtemp`, `fit-content`.
- **Use the established katakana loanword** for general technical vocabulary: スレッド, ワーカー,
  キーボード, ディレクトリ, プロジェクト, セッション, パネル, タブ, タイムライン, ラベル, イベント,
  ガード, ルーター, ルート, バンドラー, ランチャー, パッケージ, テスト, キャッシュ, ハンドラ,
  ミドルウェア, ストリーム, スナップショット. Do not coin a native-Japanese replacement for a word
  that already has a normal one.
- **No private vocabulary, no sustained metaphors.** Calling a transcript 「正本」, a project
  「巣」, a chip 「札」, or an `fs.watch` watcher 「見張り」 forces every reader to learn a second
  glossary, and makes the comment impossible to check against the code. Call things what the code
  calls them. `test/contracts/comment-vocabulary.spec.ts` fails the build on the coined words we
  have already had to remove; the words it cannot check (「場所」, 「求め」, 「答え」) are the ones
  ordinary Japanese also uses, so those stay on you.
- **Plain sentences.** Avoid runs of noun-final fragments and literary phrasing. Use `**bold**` only
  for the one thing that breaks when ignored — at most once per comment.

Fixed names for our own concepts: the session logs under `~/.claude/projects` are `transcript`;
what `ProjectJson` describes is プロジェクト; `ActivityInterval` is 稼働区間; `AppError.code` is
エラーコード; UI chips are チップ; the `fs.watch` watcher is ウォッチャー; the SSE notification is
変更通知. Keep `preferences.json` (the one file we write) and `*.meta.json` (subagent metadata)
distinct by name — a comment that confuses them is simply false. For `Observation`, `absent` is
「無かった」 and `unobservable` is 「観測できなかった」; never let those two words collapse.

**Tests write only under `mkdtemp`.** Never write to `~/.claude`, and never into a directory that
belongs to another program. If a test replaces `process.env.HOME`, it must restore it.

## Non-Interactive Shell Commands

**ALWAYS use non-interactive flags** with file operations to avoid hanging on confirmation prompts.

Shell commands like `cp`, `mv`, and `rm` may be aliased to include `-i` (interactive) mode on some systems, causing the agent to hang indefinitely waiting for y/n input.

**Use these forms instead:**
```bash
# Force overwrite without prompting
cp -f source dest           # NOT: cp source dest
mv -f source dest           # NOT: mv source dest
rm -f file                  # NOT: rm file

# For recursive operations
rm -rf directory            # NOT: rm -r directory
cp -rf source dest          # NOT: cp -r source dest
```

**Other commands that may prompt:**
- `scp` - use `-o BatchMode=yes` for non-interactive
- `ssh` - use `-o BatchMode=yes` to fail instead of prompting
- `apt-get` - use `-y` flag
- `brew` - use `HOMEBREW_NO_AUTO_UPDATE=1` env var

<!-- agents-harness:begin -->
## Code

Comments explain the intent of the code they sit on. No history, no ADRs, no provisions for the future.

## Review

When implementation or a fix is done, delegate verification to the applicable review agents before reporting completion.
<!-- agents-harness:end -->
