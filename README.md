# Ideaspace Protocol

[![CI](https://github.com/IdeaSpaces-xyz/ideaspace-protocol/actions/workflows/ci.yml/badge.svg)](https://github.com/IdeaSpaces-xyz/ideaspace-protocol/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/@ideaspaces/protocol?label=npm)](https://www.npmjs.com/package/@ideaspaces/protocol)
[![Node.js](https://img.shields.io/node/v/@ideaspaces/protocol)](package.json)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Status: provisional](https://img.shields.io/badge/protocol-provisional-orange.svg)](#status)

> The open standard for how agents turn useful work into durable, portable knowledge.

[Use with Claude Code or Cowork](https://github.com/IdeaSpaces-xyz/claude-code-plugin) · [Use with Pi](https://github.com/IdeaSpaces-xyz/pi-is-space) · [Explore this repo as an Ideaspace](https://ideaspaces.xyz/spaces/n_64dbf7878f05362337a6cda6) · [Install the library](https://www.npmjs.com/package/@ideaspaces/protocol) · [Read the spec](SPEC.md)

Agents produce decisions, findings, plans, and context while they work. Most of it disappears with the conversation. The Ideaspace Protocol gives agents a shared way to preserve what matters as ordinary Markdown with git history, so knowledge remains inspectable, editable, and useful to the next person or agent.

The standard has two parts:

- **A predictable place for knowledge.** An ideaspace is a folder of Markdown under git. Knowledge lives in `.md` files, how-to-work lives in `_agent/`, and git carries identity and history.
- **A predictable way to maintain it.** Agents follow the same operating loop: arrive → orient → inspect → act → capture → push/pull → reflect. Capture is deliberate: agree on what changed, write it down, then commit it explicitly.

This is not merely a data format for retrieval. It is an *inhabitation contract*: a shared place and a shared way for agents to work there.

This repository keeps the normative spec and skills, machine-readable schema, reference TypeScript library, and conformance kit together. Most people adopt the standard through a plugin; implementers use this package to build another conformant surface.

## Why this exists

Agent context is usually trapped in a product, a prompt, or a transcript. A fixed repository shape makes the knowledge and the agreement for working with it portable. People keep ordinary files and full history; agents get a predictable way to orient and act without every repository inventing its own instructions.

## Experience the protocol

This repository is both the definition and a conformant example. [Browse it as a public Ideaspace](https://ideaspaces.xyz/spaces/n_64dbf7878f05362337a6cda6), navigate the same Markdown as structured knowledge, ask it questions with your own agent, or copy it into your account. Its [root `_agent/` contract](https://github.com/IdeaSpaces-xyz/ideaspace-protocol/tree/main/_agent) dogfoods the protocol it defines.

## What's here

| Path | What |
|---|---|
| [`SPEC.md`](SPEC.md) | **Normative.** The shape, identity, two layers, conformance (MUST/SHOULD). |
| [`SKILLS.md`](SKILLS.md) | **Normative.** The ability layer — the agent operating loop and shared intent skills for orientation, deliberate capture, directional sync, and reflection. |
| [`schema/`](schema/) | Language-neutral contract — frontmatter, `_agent/`, Change/surface state, structured Content awareness, and local workspace handles. |
| [`src/`](src/) | Reference TypeScript implementation — frontmatter, contract/path reads, structured awareness assembly/rendering, workspace handles, git state, drift, and the skill catalog. |
| [`conformance/`](conformance/) | A reference conformant space and a validator that checks a space (and an implementation) against the spec. |
| [`VERSION`](VERSION) | Current spec version. Tools declare conformance to a version. |

## Concepts in 30 seconds

- **Position.** Every directory is a position, presenting as *summary → surface → children*. Its surface — a `README.md`, a repo's root README, or a lone `.md` file — says what it is, for everyone. Depth is elaboration: a child answers "what do you mean?" about the surface above it.
- **Two kinds of content.** Plain `.md` files are *knowledge*; the `_agent/` folder is *agent context* (how to work here). Everything not underscore-prefixed is knowledge.
- **The `_agent/` contract.** `foundation.md` (root handshake), `guide.md`, `purpose.md`, `now.md`, `next.md`, and optional `schema.md` (the shape of Notes in the folder — guidance, not validation). Give it a good surface: loaded at depth 0, with depth on demand.
- **Fractal.** `_agent/` can appear at any position and composes along the path: general at the root, specific as you descend.
- **Identity in git.** The author is the person; an agent that helped adds a `Co-authored-by:` trailer. Provenance rides in git, not in a file's frontmatter.

The full, normative version is [`SPEC.md`](SPEC.md).

## Using the reference library

```bash
npm install @ideaspaces/protocol
```

```ts
import {
  assembleContentAwareness,
  renderContentAwareness,
} from "@ideaspaces/protocol";

const manifest = await assembleContentAwareness({ position: process.cwd() });
if (!manifest) throw new Error("No ideaspace contract resolves here");

// Render all canonical sections, or select a subset for harness placement.
const text = renderContentAwareness(manifest);
const stable = renderContentAwareness(manifest, {
  sections: ["position", "now", "tree", "contract", "skills"],
});
```

Inspect one Markdown document without defaulting to its full body:

```ts
import { inspectMarkdownFile } from "@ideaspaces/protocol";

const outline = await inspectMarkdownFile("work/Next.md", { mode: "outline" });
const section = await inspectMarkdownFile("work/Next.md", {
  mode: "section",
  heading: "Current window",
});
```

Local harnesses can also read neutral, unrendered workspace handles without
assigning protocol-level home/mount/POV roles:

```ts
import {
  readRootHandle,
  readWorkspaceRepositories,
} from "@ideaspaces/protocol";

const home = await readRootHandle(process.cwd());
const repositories = await readWorkspaceRepositories("../");
```

The TypeScript library is the *reference* implementation, not the only one. Other languages conform to the language-neutral core — [`SPEC.md`](SPEC.md) + [`schema/frontmatter.schema.json`](schema/frontmatter.schema.json) + the conformance fixtures.

## Conformance

A tool that claims to inhabit ideaspaces follows the **MUST/SHOULD** in [`SPEC.md`](SPEC.md#conformance) and declares the spec version it targets. The [`conformance/`](conformance/) kit makes that testable.

## Ecosystem

The protocol owns the portable repository shape and operating-loop semantics. Plugins make that standard native to an agent harness; the CLI implements shared capture, commit, and sync mechanics; each surface keeps its own tools, permissions, placement, and lifecycle behavior.

| Project | Role |
|---|---|
| **Ideaspace Protocol** | Spec, schema, reference library, skills, and conformance kit — this repository. |
| [Claude Code plugin](https://github.com/IdeaSpaces-xyz/claude-code-plugin) | The recommended local-first path for Claude Code and Cowork; includes the Ideaspace skills and MCP tools. |
| [Pi extension](https://github.com/IdeaSpaces-xyz/pi-is-space) | Protocol-backed awareness, capture, and sync in Pi. |
| [CLI](https://github.com/IdeaSpaces-xyz/cli) | Create, publish, clone, push, pull, and automate spaces from the terminal. |
| [SDK](https://github.com/IdeaSpaces-xyz/sdk) | Keeper transport types and Pi-to-Keeper translation; not a protocol compatibility layer. |
| [IdeaSpaces](https://ideaspaces.xyz) | Optional hosting for sharing, access control, public exploration, and search across spaces. |

## Status

**v0.5.0 — early and provisional.** This minor release makes fractal composition full-stack (`ComposedSpace.stack`: ancestors retained, nearest instruction wins, skills union with deeper shadowing) and ships the canonical foundation core — the conduct seed scaffolds compose into a new space's `_agent/foundation.md`, exported as `FOUNDATION_CORE` and as a raw `templates/` asset for non-TypeScript runtimes. Pin a version and expect changes before 1.0, including evolution of the open `attached_to` type vocabulary.

## Develop

```bash
npm ci
npm run build      # build the reference library (ESM → dist/)
npm test           # run the suite (vitest)
npx tsc --noEmit   # typecheck
```

See [`_agent/guide.md`](_agent/guide.md) for how to work in this repo.

## License

[MIT](LICENSE).
