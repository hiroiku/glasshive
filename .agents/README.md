# The bundled harness

English | [日本語](docs/README.ja.md) | [简体中文](docs/README.zh-CN.md) | [繁體中文](docs/README.zh-TW.md) | [한국어](docs/README.ko.md) | [Deutsch](docs/README.de.md) | [Español](docs/README.es.md) | [Français](docs/README.fr.md)

[README](../README.md) describes the mechanism — one corpus, deployed by `agents-setup` into `~/.agents` and per-project `.agents/`. This document describes what that corpus ships in `payload/`: a complete, working harness, included as the sample you start from and personalize.

## Written for models that judge

The harness is built for the current generation of models, which follow judgment better than rules. Every instruction is a cost twice over: it occupies the session's finite attention, and it binds the model where its own judgment may be better. So the corpus records only what a capable model cannot derive:

- **Opinions** — conventions no amount of capability can guess: how commits are titled, what never goes in a commit message
- **Anchors** — the external canon a piece of work must satisfy: OWASP Top 10, WCAG 2.2 AA
- **Boundaries** — who may do what: a reviewer that cannot edit

Everything else — how to search, how deep to go, what a finding looks like — is left to the model. When a failure mode is actually observed, the smallest instruction that prevents it is added; nothing is added in advance. The calibration guides are named in the [dotagents-prompting](skills/dotagents-prompting/SKILL.md) skill and are read before any prompt in this corpus is edited.

## Three shapes of delivery

- **Ubiquitous** ([AGENTS.md](AGENTS.md)) — injected into every session, taxing every session's attention, so it holds a single sentence: _when implementation or a fix ends, delegate verification to the applicable review agents before reporting completion._
- **Momentary** ([skills/](skills/)) — read only when their moment arrives: [dotagents-git](skills/dotagents-git/SKILL.md) at commit time, [dotagents-prompting](skills/dotagents-prompting/SKILL.md) when editing prompts. Detail here costs no other moment anything.
- **Roles** ([agents/](agents/)) — subagents with a context of their own and a restricted toolset. What a role must not do is enforced by the tools it is not given, not by a sentence it must remember.

## Review — a clean context, hunting for what is missing

The failure mode peculiar to AI agents is "done!" when it is not done — not lying but omission: a context that holds only what it wrote cannot see what it did not write. So verification goes to review agents whose context is clean. They receive the requirements, how to locate the target, and how to run it — never the implementer's self-report.

[dotagents-review](agents/dotagents-review.md) works in two passes, in order:

1. **Existence** — start from each requirement and find the implementation that satisfies it. An omission is invisible in a diff, so the scan runs from the requirements toward the code, not from the diff outward.
2. **Correctness** — examine whether what was found is done right.

Reviewers read and run; they do not edit. `Read, Glob, Grep, Bash` is the whole toolset.

## Requirement anchors, not checklists

[dotagents-security](agents/dotagents-security.md) verifies against the [OWASP Top 10](https://owasp.org/Top10/); [dotagents-accessibility](agents/dotagents-accessibility.md) against [WCAG 2.2](https://www.w3.org/TR/WCAG22/) conformance level AA. Each names its canon and stops there: no copied checklist (a copy rots as the canon moves), no house criteria on top (an enumeration binds judgment to the enumerator's imagination). Which category applies, and how, is judged against the code at hand.

## Git — the conventions a model cannot guess

[dotagents-git](skills/dotagents-git/SKILL.md) holds the whole opinion in a few lines: commit titles say what changed for the business, never a filename or an internal identifier; no AI attribution in commit messages or PRs; squash is the default for integration; follow upstream by rebase, not merge.
