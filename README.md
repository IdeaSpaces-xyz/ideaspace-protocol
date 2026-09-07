# Ideaspace Protocol

[![CI](https://github.com/IdeaSpaces-xyz/ideaspace-protocol/actions/workflows/ci.yml/badge.svg)](https://github.com/IdeaSpaces-xyz/ideaspace-protocol/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/@ideaspaces/protocol?label=npm)](https://www.npmjs.com/package/@ideaspaces/protocol)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Status: provisional](https://img.shields.io/badge/protocol-provisional-orange.svg)](#status)

> An agent is a folder. This is the shape of that folder.

An ideaspace is a folder of Markdown under git that holds two things: **your knowledge**, and **how to work with it**. Open an agent inside it and that's who you're talking to. The instructions live in the folder, not in the model or the tool that runs it, so any agent that knows the shape can work in any folder that has it, and the folder outlives both.

Instruction files such as `CLAUDE.md` and `AGENTS.md` proved that agents read guidance kept in the repo, and found the ceiling: one file, holding everything, followed worse the longer it grows. So the file grows up into a folder. `_agent/` sits beside the knowledge and holds how to work here in a few small files, and the agent picks up only the piece the task needs.

This repository is the standard: the spec, a machine-readable schema, a reference TypeScript library, and a conformance kit, kept together so they cannot drift apart. It is an ideaspace itself.

[How it works](https://ideaspaces.xyz/how-it-works) · [Use with Claude Code, Codex, or Cowork](https://github.com/IdeaSpaces-xyz/claude-code-plugin) · [Use with Pi](https://github.com/IdeaSpaces-xyz/pi-is-space) · [CLI](https://github.com/IdeaSpaces-xyz/cli) · [Read the spec](SPEC.md)

## The shape

One rule about a directory. Anything not prefixed with an underscore is **content**: plain Markdown, for anyone. `_agent/` is **how to work here**. Any other underscore folder is an extension, and a tool that does not recognise it leaves it alone.

```
~/space/
├─ README.md            what this place is
├─ decisions.md         content — for anyone
├─ findings.md
│
├─ _agent/              how to work here
│  ├─ foundation.md     what kind of place; one per space, at its root
│  ├─ purpose.md        why it exists
│  ├─ guide.md          how we work
│  ├─ now.md            the current focus
│  ├─ next.md           what's queued
│  └─ skills/           procedures for here, loaded only when used
│
└─ pricing/             a folder inside it
   ├─ model.md
   └─ _agent/           composes on the one above
      └─ guide.md       no number without a source
```

`_agent/` can appear at any depth. A deeper one composes on the one above: general at the root, specific as you descend. That is why the same tools work everywhere; every folder has the same shape. A missing file is a signal, not an error. No `purpose.md` means nobody has written down why the place exists yet.

## What a conformant tool does

1. **Arrive.** Read `_agent/` from the root down to where it stands, the tree, and what changed since last time. Summaries first; whole files on demand.
2. **Work.** Read one document, one section at a time, following the guide and the skills that apply here.
3. **Write back.** When understanding changes, write it down as Markdown, agreed with the person.
4. **Commit.** Git records who changed what and when. The person is the author; an agent that helped is a co-author.

Git is the history and the provenance. "What did we believe in March, and why did it change?" is `git log`.

## What's here

| Path | What |
|---|---|
| [`SPEC.md`](SPEC.md) | **Normative.** The shape, identity, and what a tool must and should do. |
| [`SKILLS.md`](SKILLS.md) | **Normative.** How an agent arrives, works, writes back, and syncs. |
| [`schema/`](schema/) | The language-neutral contract: frontmatter, paths, `_agent/`, `_assets/`, identity, local writes, and the provisional `map` block. |
| [`src/`](src/) | The reference TypeScript implementation. |
| [`conformance/`](conformance/) | A reference space, a validator, and vectors any implementation can run. |
| [`VERSION`](VERSION) | The spec version tools declare against. |

## The reference library

```bash
npm install @ideaspaces/protocol
```

One function reads a folder and renders what an agent should see on arrival. The same function serves the Claude Code plugin's session hook and Pi's session start.

```ts
import { assembleContentAwareness, renderContentAwareness } from "@ideaspaces/protocol";

const manifest = await assembleContentAwareness({ position: process.cwd() });
if (!manifest) throw new Error("No ideaspace here");

const text = renderContentAwareness(manifest);
```

The library also walks the full tree, reads one section of a document, classifies paths, resolves supporting files, evaluates a space's identity, and performs safe local writes through the explicit `local-effects` subpath with a git runner you supply. Each export is documented in [`src/`](src/) and proved by [`conformance/`](conformance/).

TypeScript is the reference implementation, not the requirement. Other languages conform to [`SPEC.md`](SPEC.md), [`schema/`](schema/), and the vectors.

## Conformance

A tool that claims to work in ideaspaces follows the **MUST** and **SHOULD** in [`SPEC.md`](SPEC.md#conformance), passes the base vectors, and declares the spec version it targets. The optional layers, `_assets/`, identity, local writes, and the provisional `map` block, each have their own vectors, so a tool can conform to the base without any of them.

## Status

**v0.13.5, provisional.** The base shape, Markdown beside `_agent/` composing at every depth, has held since v0.1.0. The optional layers still move. Pin a version.

## Develop

```bash
npm ci
npm run build      # ESM → dist/
npm test           # vitest
npx tsc --noEmit
```

See [`_agent/guide.md`](_agent/guide.md) for how to work in this repo.

## License

[MIT](LICENSE).
