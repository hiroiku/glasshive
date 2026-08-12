# Contributing

Thanks for looking. Bug reports, questions, and patches are all welcome —
[open an issue](https://github.com/hiroiku/glasshive/issues) if something is broken or missing.

## Getting set up

```sh
npm install
npm run dev     # http://127.0.0.1:4483
```

The dev server takes 4483, the same port a packaged `glasshive` uses — one number to remember. If
4483 is already taken (say you left the packaged build running), Vite steps to the next free port
and prints it. Both bind to `127.0.0.1` and reject requests whose `Host` header is not local.

To run what users actually get:

```sh
npm run build
npm start       # http://127.0.0.1:4483
```

[Bun](https://bun.com/) works as-is — replace `npm` with `bun` and everything passes, including on a
machine with no npm installed. Composite scripts call each other through `$npm_execpath` rather than
hardcoding `npm run`, and no script shells out to `npx`; a contract test
(`test/contracts/dev-scripts.spec.ts`) fails if either creeps back in.

## Quality gates

```sh
npm run check   # everything below, in order
```

| Step | What it checks |
| --- | --- |
| `biome ci .` | Formatting and lint rules |
| `npm run arch` | Layer boundaries and file-naming conventions |
| `npm run typecheck` | Eight TypeScript projects — one per layer, plus the app and the launcher |
| `npm run test` | Vitest, `unit` and `ui` projects |

`npm run test:smoke` is separate because it runs against `dist/`. **Build before you check on a
clean checkout** — `routeTree.gen.ts` is generated, so types do not resolve until `npm run build`
has run once. CI does exactly this.

## Architecture

```
src/app-kernel/       Vocabulary every layer shares: Observation, Result, AppError, Clock
src/domain/           Derivation rules. Pure functions; reads nothing
src/application/      Use cases and ports. The shape of what gets read is decided here
src/interface/        Controllers and presenters. The outward JSON shape lives only here
src/infrastructure/   The layer that actually reads: files, processes, git
src/frameworks/       TanStack Start (SPA) and the dependency-free Node launcher
src/composition/      Wiring
```

Dependencies point one way, and `npm run arch` fails if they do not:

| Layer | May import |
| --- | --- |
| `app-kernel` | nothing |
| `domain` | `app-kernel` |
| `application` | `app-kernel`, `domain` |
| `interface` | `app-kernel`, `application` |
| `infrastructure` | `app-kernel`, `application` |
| `frameworks` | `app-kernel`, `interface`, `composition` |
| `composition` | everything except `frameworks` |

Two consequences worth knowing before you move code around:

- **`interface` and `infrastructure` never name `domain`.** They speak to it through `application`.
- **`domain` never crosses a bounded context.** `sessions`, `issues`, `git`, and `workspace` are
  separate; coordinating them is `application`'s job. This is the one rule the type system cannot
  catch on its own, since it is a same-layer import. `issues` means GitHub issues and nothing
  else — every issue glasshive shows arrives through the `gh` CLI.

The bundler enforces the same boundaries from the other side: `vite.config.ts` sets
`importProtection` so a build fails if `src/infrastructure/**`, `src/composition/**`, or `node:fs`
and friends reach the browser bundle.

Beyond the layers, three ideas carry most of the design:

- **`Observation<T>`** — every observed value is `observed`, `absent` (with a reason), or
  `unobservable` (with the error). Observation results are values and never throw; programmer
  mistakes are exceptions and never get caught. Do not collapse `absent` into `unobservable` or the
  other way round: the whole point is that "nothing happened" and "we could not look" stay distinct
  all the way to the screen.
- **Ports split by access shape.** A *repository* reads a store whose format we know and rebuilds our
  own model from it — transcripts, `preferences.json`. An *integration* asks someone else and
  translates the answer — `git`, the `gh` CLI, the avatar images `gh` points at. They fail
  differently and they are faked differently in tests, which is why the line is drawn there. The
  `issues` context is integrations all the way down; it has no repository, because there is no local
  file it reads.
- **`ViewerPreferencesRepository` is the only port with a write method.** If you find yourself adding
  a second one, something has gone wrong.

## Tests

| Project | Environment | Covers |
| --- | --- | --- |
| `unit` | node | Pure domain services, use cases against in-memory ports, presenters, contracts |
| `ui` | happy-dom | Components and route components, rendered and inspected |
| `visual` | Chromium | What the CSS rules that carry an `Observation` claim actually paint |
| `smoke` | node | The built `dist/`, launched for real and fetched over HTTP |

`visual` exists because `ui` cannot see CSS at all. happy-dom has no layout and no cascade, so a
rule can be written, matched, and inert, and every DOM assertion still passes — which matters here
because several rules *are* the observation. The hatch is how a row says "we could not read this";
the dashed flag is how a close time says "this is a substitute for one we never saw". When one of
those silently does nothing, the screen does not degrade, it states the opposite of what we saw.

So `visual` renders the real components with the real `index.css` in a real browser, screenshots an
element with and without the rule applied, and counts the pixels that changed. It is `npm run
test:visual`, not part of `check`, because it needs a browser: `npx playwright install chromium`
once, and CI installs it in its own job. Keep it to rules that carry a claim — this is not a
screenshot suite, and a diff of a whole screen would be noise.

Two rules are absolute:

- **Tests only write under `mkdtemp`.** Never `~/.claude`, never a project someone actually works
  in. The `.beads` and `.git` directories in the preferences tests are sandbox ones the test builds
  itself: glasshive reads no beads ledger, but `ViewerPreferencesRepository` still refuses to drop
  `preferences.json` inside either, and that refusal has to be proven somewhere safe. If a test
  replaces `process.env.HOME`, it must put it back.
- **Determinism comes from injection, not from sleeping.** Time arrives through the `Clock` port.

## Language

Code comments are written in Japanese and explain the *intent* of the code they sit on — not its
history, not decisions already recorded in an ADR, not provisions for a future that has not arrived.

Japanese here means ordinary Japanese technical prose, and it never means translating the English
away. Technical terms keep their original spelling in backticks — identifiers, type names, API
names, filenames, CSS properties and values (`transcript`, `subgrid`, `user-select`, `Observation`)
— and general vocabulary uses the established katakana loanword (ディレクトリ, パネル, ランチャー,
バンドラー, ウォッチャー). Do not coin private words or sustained metaphors for things the code
already names; the Conventions section of [AGENTS.md](AGENTS.md) lists the fixed names.

Everything users see is English: UI strings, `--help`, error messages that reach a screen or a
terminal. `test/contracts/ui-language.spec.ts` strips comments and fails if Japanese shows up in a
string literal or JSX text under `src/frameworks/tanstack`. Observed data — transcripts, issue
titles, branch names — is shown verbatim in whatever language it was written in.

## Pull requests

- Keep `npm run check` and `npm run test:smoke` green. If you touched a rule under
  `src/frameworks/tanstack/ui/styles/`, `npm run test:visual` too.
- Match the surrounding code: same comment density, naming, and idiom.
- If behaviour changes, say so in the PR body. If it changes what users see, update the README and
  the translations under `docs/`.
